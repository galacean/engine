# Memory Management

Galacean Engine provides a comprehensive set of memory management tools designed to minimize garbage collection pressure and optimize performance in real-time applications. These tools include object pools, specialized arrays, and memory-efficient data structures.

## Object Pool System

### IPoolElement Interface

All pooled objects must implement the `IPoolElement` interface:

```ts
interface IPoolElement {
  /**
   * Called when the object is returned to the pool.
   * Use this to reset the object state and release references.
   */
  dispose?(): void;
}

// Example implementation
class PooledObject implements IPoolElement {
  data: any[] = [];
  
  dispose(): void {
    // Clear references to prevent memory leaks
    this.data.length = 0;
    this.someReference = null;
  }
}
```

### ObjectPool (Abstract Base)

The base class for all object pool implementations:

```ts
abstract class ObjectPool<T extends IPoolElement> {
  protected _type: new () => T;
  protected _elements: T[];
  
  constructor(type: new () => T) {
    this._type = type;
  }
  
  // Cleanup all pooled objects
  garbageCollection(): void {
    const elements = this._elements;
    for (let i = elements.length - 1; i >= 0; i--) {
      elements[i].dispose && elements[i].dispose();
    }
    elements.length = 0;
  }
  
  abstract get(): T;
}
```

### ClearableObjectPool

Optimized for scenarios where objects are used in batches and then cleared all at once:

```ts
class ClearableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _usedElementCount: number = 0;
  
  constructor(type: new () => T) {
    super(type);
    this._elements = [];
  }
  
  get(): T {
    const { _usedElementCount: usedCount, _elements: elements } = this;
    this._usedElementCount++;
    
    if (elements.length === usedCount) {
      // Create new object if pool is exhausted
      const element = new this._type();
      elements.push(element);
      return element;
    } else {
      // Reuse existing object
      return elements[usedCount];
    }
  }
  
  clear(): void {
    // Reset usage counter without destroying objects
    this._usedElementCount = 0;
  }
}

// Usage example
const renderElementPool = new ClearableObjectPool(RenderElement);

// During frame rendering
const element1 = renderElementPool.get();
const element2 = renderElementPool.get();

// At end of frame
renderElementPool.clear(); // Reset for next frame
```

### ReturnableObjectPool

Best for objects with unpredictable lifetimes that need explicit return:

```ts
class ReturnableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _lastElementIndex: number;
  
  constructor(type: new () => T, initializeCount: number = 1) {
    super(type);
    this._lastElementIndex = initializeCount - 1;
    this._elements = new Array<T>(initializeCount);
    
    // Pre-populate pool
    for (let i = 0; i < initializeCount; ++i) {
      this._elements[i] = new type();
    }
  }
  
  get(): T {
    if (this._lastElementIndex < 0) {
      // Pool exhausted, create new object
      return new this._type();
    }
    return this._elements[this._lastElementIndex--];
  }
  
  return(element: T): void {
    // Call dispose before returning to pool
    element.dispose && element.dispose();
    this._elements[++this._lastElementIndex] = element;
  }
}

// Usage example
const vertexAreaPool = new ReturnableObjectPool(VertexArea, 10);

function allocateVertexArea(): VertexArea {
  const area = vertexAreaPool.get();
  area.start = 0;
  area.size = 100;
  return area;
}

function freeVertexArea(area: VertexArea): void {
  vertexAreaPool.return(area); // Automatically calls dispose()
}
```

## Specialized Array Types

### DisorderedArray

High-performance array that uses swap-delete for O(1) removal:

```ts
class DisorderedArray<T> {
  length = 0;
  private _elements: T[];
  private _loopCounter = 0;
  private _blankCount = 0;
  
  constructor(count: number = 0) {
    this._elements = new Array<T>(count);
  }
  
  get isLopping(): boolean {
    return this._loopCounter > 0;
  }
  
  add(element: T): void {
    this._elements[this.length++] = element;
  }
  
  // O(1) removal using swap with last element
  deleteByIndex(index: number): void {
    const elements = this._elements;
    const lastIndex = --this.length;
    
    if (index !== lastIndex) {
      elements[index] = elements[lastIndex];
    }
    elements[lastIndex] = null;
  }
  
  // Safe iteration with modification support
  forEach(
    callback: (element: T, index: number) => void,
    endCallback?: (element: T, index: number) => void
  ): void {
    this._loopCounter++;
    
    for (let i = 0; i < this.length; i++) {
      const element = this._elements[i];
      if (element) {
        callback(element, i);
      }
    }
    
    if (endCallback) {
      for (let i = 0; i < this.length; i++) {
        const element = this._elements[i];
        if (element) {
          endCallback(element, i);
        }
      }
    }
    
    this._loopCounter--;
  }
}

// Usage example
class ComponentManager {
  private _scripts = new DisorderedArray<Script>();
  
  addScript(script: Script): void {
    this._scripts.add(script);
  }
  
  removeScript(script: Script): void {
    const index = this._scripts.indexOf(script);
    if (index !== -1) {
      this._scripts.deleteByIndex(index); // O(1) removal
    }
  }
  
  updateScripts(): void {
    this._scripts.forEach((script, index) => {
      if (script.enabled) {
        script.onUpdate();
      }
    });
  }
}
```

### SafeLoopArray

Array that supports safe modification during iteration:

```ts
class SafeLoopArray<T> {
  private _array: T[] = [];
  private _loopArray: T[] = [];
  private _loopArrayDirty: boolean = false;
  
  get length(): number {
    return this._array.length;
  }
  
  push(item: T): void {
    this._array.push(item);
    this._loopArrayDirty = true;
  }
  
  add(index: number, item: T): void {
    this._array.splice(index, 0, item);
    this._loopArrayDirty = true;
  }
  
  remove(item: T): void {
    const index = this._array.indexOf(item);
    if (index !== -1) {
      this._array.splice(index, 1);
      this._loopArrayDirty = true;
    }
  }
  
  // Safe iteration - uses snapshot of array
  forEach(callback: (item: T, index: number) => void): void {
    if (this._loopArrayDirty) {
      this._loopArray = [...this._array];
      this._loopArrayDirty = false;
    }
    
    for (let i = 0; i < this._loopArray.length; i++) {
      callback(this._loopArray[i], i);
    }
  }
  
  findAndRemove(predicate: (item: T) => boolean): boolean {
    for (let i = this._array.length - 1; i >= 0; i--) {
      if (predicate(this._array[i])) {
        this._array.splice(i, 1);
        this._loopArrayDirty = true;
        return true;
      }
    }
    return false;
  }
}

// Usage example
class EventManager {
  private _listeners = new SafeLoopArray<EventListener>();
  
  addEventListener(listener: EventListener): void {
    this._listeners.push(listener);
  }
  
  removeEventListener(listener: EventListener): void {
    this._listeners.remove(listener);
  }
  
  dispatchEvent(event: Event): void {
    // Safe to modify listeners during iteration
    this._listeners.forEach((listener) => {
      if (listener.handleEvent(event)) {
        // Can safely remove listener during iteration
        this.removeEventListener(listener);
      }
    });
  }
}
```

## Engine Integration

### Core Engine Pools

The engine uses various pools for performance-critical objects:

```ts
class Engine {
  // Render element pools
  _renderElementPool = new ClearableObjectPool(RenderElement);
  _subRenderElementPool = new ClearableObjectPool(SubRenderElement);
  _textSubRenderElementPool = new ClearableObjectPool(SubRenderElement);
  
  // Character rendering pool
  _charRenderInfoPool = new ReturnableObjectPool(CharRenderInfo, 50);
  
  // Clear pools at end of frame
  _endFrame(): void {
    this._renderElementPool.clear();
    this._subRenderElementPool.clear();
    this._textSubRenderElementPool.clear();
  }
}
```

### Component System Integration

```ts
class Entity {
  // Scripts use DisorderedArray for O(1) removal
  _scripts: DisorderedArray<Script> = new DisorderedArray<Script>();
  
  addScript<T extends Script>(scriptClass: new () => T): T {
    const script = new scriptClass();
    this._scripts.add(script);
    return script;
  }
  
  removeScript(script: Script): void {
    const index = this._scripts.indexOf(script);
    if (index !== -1) {
      this._scripts.deleteByIndex(index);
    }
  }
}
```

### UI System Integration

```ts
class UIGroup {
  // UI elements use DisorderedArray for efficient management
  _disorderedElements: DisorderedArray<IGroupAble> = new DisorderedArray<IGroupAble>();
  
  addElement(element: IGroupAble): void {
    this._disorderedElements.add(element);
    element._indexInGroup = this._disorderedElements.length - 1;
  }
  
  removeElement(element: IGroupAble): void {
    const index = element._indexInGroup;
    if (index !== -1) {
      this._disorderedElements.deleteByIndex(index);
      element._indexInGroup = -1;
    }
  }
}
```

## Best Practices

### 1. Choose the Right Pool Type

```ts
// Use ClearableObjectPool for frame-based objects
const framePool = new ClearableObjectPool(FrameData);

// Use ReturnableObjectPool for long-lived objects with explicit lifecycle
const resourcePool = new ReturnableObjectPool(Resource, 10);

// Use DisorderedArray for collections with frequent additions/removals
const activeObjects = new DisorderedArray<GameObject>();

// Use SafeLoopArray when modification during iteration is needed
const eventListeners = new SafeLoopArray<EventListener>();
```

### 2. Implement Proper Disposal

```ts
class PooledResource implements IPoolElement {
  private _texture: Texture2D;
  private _callbacks: Function[] = [];
  
  dispose(): void {
    // Clear references to prevent memory leaks
    this._texture = null;
    this._callbacks.length = 0;
    
    // Reset state for reuse
    this.isActive = false;
    this.userData = null;
  }
}
```

### 3. Monitor Pool Performance

```ts
class PoolProfiler {
  static profilePool<T extends IPoolElement>(pool: ObjectPool<T>, name: string): void {
    const originalGet = pool.get.bind(pool);
    let getCount = 0;
    let createCount = 0;
    
    pool.get = function(): T {
      getCount++;
      const element = originalGet();
      if (!element._fromPool) {
        createCount++;
        element._fromPool = true;
      }
      return element;
    };
    
    setInterval(() => {
      console.log(`Pool ${name}: ${getCount} gets, ${createCount} creates, ${((createCount/getCount)*100).toFixed(1)}% miss rate`);
      getCount = createCount = 0;
    }, 5000);
  }
}
```

### 4. Batch Operations

```ts
class BatchProcessor {
  private _pool = new ClearableObjectPool(ProcessingTask);
  private _tasks: ProcessingTask[] = [];
  
  addTask(data: any): void {
    const task = this._pool.get();
    task.setup(data);
    this._tasks.push(task);
  }
  
  processBatch(): void {
    // Process all tasks
    for (const task of this._tasks) {
      task.execute();
    }
    
    // Clear tasks and reset pool
    this._tasks.length = 0;
    this._pool.clear();
  }
}
```

### 5. Memory Leak Prevention

```ts
class LeakSafePool<T extends IPoolElement> extends ClearableObjectPool<T> {
  private _activeElements = new WeakSet<T>();
  
  get(): T {
    const element = super.get();
    this._activeElements.add(element);
    return element;
  }
  
  clear(): void {
    // Ensure all active elements are properly disposed
    for (const element of this._elements) {
      if (this._activeElements.has(element)) {
        element.dispose && element.dispose();
      }
    }
    super.clear();
  }
}
```

The memory management system is designed to minimize garbage collection pressure while maintaining high performance. Choose the appropriate tools based on your specific use case and object lifecycle patterns.
