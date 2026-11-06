"""Event-hook native replay for production construction, without block tracing.

The provider still owns native execution, allocator, libSystem math and adapter
semantics. Only hook registration and provenance differ. Call make_replay_class()
after loading scene_native_runtime, then inject the returned factory into the
DynamicScene module's Replay binding. No provider files or globals are modified
by this module. Original block-audit Replay remains available independently.
"""
import ast
from collections.abc import MutableMapping
import inspect
import textwrap

_CODE_START = 0x100000000
_EXTERNAL_START = 0x1023c7000
_PINNED_BINARY = '4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a'


class _Adapters(MutableMapping):
    """Single owner of dictionary state and the matching native entry hooks."""
    def __init__(self, owner):
        self._owner = owner
        self._values = {}

    def __getitem__(self, key):
        return self._values[key]

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __setitem__(self, key, value):
        if not isinstance(key, int) or not 0 <= key <= 0xffffffffffffffff:
            raise ValueError('Adapter address must be uint64')
        if not isinstance(value, tuple) or len(value) != 2 or not callable(value[1]):
            raise ValueError('Adapter requires (name, callback)')
        if key not in self._values:
            self._owner._add_adapter_hook(key)
        self._values[key] = value

    def __delitem__(self, key):
        if key not in self._values:
            raise KeyError(key)
        self._owner._remove_adapter_hook(key)
        del self._values[key]

    def copy(self):
        return self._values.copy()

    def __ior__(self, other):
        self.update(other)
        return self


def _shim_entries(base):
    """Read the provider's actual dispatcher table instead of cloning its math."""
    tree = ast.parse(textwrap.dedent(inspect.getsource(base.hook)))
    tables = [node.value for node in ast.walk(tree)
              if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'sh' for t in node.targets)]
    if len(tables) != 1 or not isinstance(tables[0], ast.Dict):
        raise ValueError('Unknown provider shim dispatcher; event replay not enabled')
    keys = tables[0].keys
    if not all(isinstance(k, ast.Constant) and type(k.value) is int for k in keys):
        raise ValueError('Unknown provider shim entry; event replay not enabled')
    return frozenset(k.value for k in keys)


def make_replay_class(base_replay=None):
    """Return a Replay-compatible factory for the pinned provider/binary ABI."""
    import scene_native_runtime as rt
    from unicorn import UC_HOOK_CODE
    base = rt.Replay if base_replay is None else base_replay
    if rt.EXPECTED != _PINNED_BINARY:
        raise ValueError('Event replay has not been verified for this binary')
    entries = _shim_entries(base)

    class EventReplay(base):
        def __init__(self):
            # Same native machine and resource arena as the provider constructor;
            # do not call base.__init__, which installs an unowned global hook.
            self.mu = rt.create_machine(cpu_model=rt.UC_CPU_ARM64_MAX)
            self.mu.mem_map(rt.SCRATCH + 0x100000, 0xf00000)
            self.heap = rt.SCRATCH + 0x10000
            self.allocs = {}
            self.shims = {}
            self.functions = set()
            self.blocks = set()
            self.steps = 0
            self.tail = []
            self._closed = False
            self._entry_calls = {}
            self._event_calls = 0
            self._fixed_hooks = []
            self._adapter_hooks = {}
            self._fixed_entries = entries
            self._adapters = _Adapters(self)
            self._fixed_hooks.append(self.mu.hook_add(UC_HOOK_CODE, self._event,
                                                       begin=0, end=_CODE_START - 1))
            self._fixed_hooks.append(self.mu.hook_add(UC_HOOK_CODE, self._event,
                                                       begin=_EXTERNAL_START, end=0xffffffffffffffff))
            for entry in sorted(entries):
                if _CODE_START <= entry < _EXTERNAL_START:
                    self._fixed_hooks.append(self.mu.hook_add(UC_HOOK_CODE, self._event,
                                                               begin=entry, end=entry))

        @property
        def adapters(self):
            return self._adapters

        @adapters.setter
        def adapters(self, values):
            # Snapshot before mutation: assignments may reference this same map.
            values = dict(values)
            for key in list(self._adapters):
                if key not in values:
                    del self._adapters[key]
            self._adapters.update(values)

        def _add_adapter_hook(self, entry):
            if self._closed:
                raise RuntimeError('Native replay owner is closed')
            if entry in self._fixed_entries or not _CODE_START <= entry < _EXTERNAL_START:
                return  # The fixed/range hook dispatches current adapter values.
            handle = self.mu.hook_add(UC_HOOK_CODE, self._event, begin=entry, end=entry)
            self._adapter_hooks[entry] = handle
            # Native roots may already have translated this instruction before
            # an observer/resource adapter was installed for a later family.
            self.mu.ctl_remove_cache(entry, entry + 4)

        def _remove_adapter_hook(self, entry):
            handle = self._adapter_hooks.get(entry)
            if handle is not None:
                self.mu.hook_del(handle)
                del self._adapter_hooks[entry]
                self.mu.ctl_remove_cache(entry, entry + 4)

        def _event(self, uc, pc, size, user):
            self._event_calls += 1
            # Reuse the provider's real allocator, ABI shims, custom callbacks
            # and unbound-external/low-address rejection, not copied formulas.
            return base.hook(self, uc, pc, size, user)

        def call(self, entry, args=(), out=None, count=30000000):
            if self._closed:
                raise RuntimeError('Native replay owner is closed')
            self._entry_calls[entry] = self._entry_calls.get(entry, 0) + 1
            # Preserves the native Unicorn instruction budget and end-PC check.
            return base.call(self, entry, args, out, count)

        def provenance(self):
            return {
                'binary_sha256': rt.EXPECTED,
                'execution_mode': 'native-event-hooks',
                'coverage': 'ABI/shim/guard events and explicit call entries only; no basic-block trace or whole-execution instruction count',
                'original_functions': [],
                'block_visits_instruction_upper_count': None,
                'executed_source_blocks': [],
                'adapters_and_platform_calls': dict(self.shims),
                'event_hook_calls': self._event_calls,
                'explicit_root_calls': [{'address': hex(k), 'count': v} for k, v in sorted(self._entry_calls.items())],
            }

        def close(self):
            """Release only this owner's hooks; retain failed handles for retry."""
            for entry in list(self._adapter_hooks):
                self._remove_adapter_hook(entry)
            while self._fixed_hooks:
                handle = self._fixed_hooks[-1]
                self.mu.hook_del(handle)
                self._fixed_hooks.pop()
            self._closed = True

    return EventReplay
