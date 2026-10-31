A subpackage of `@galacean/engine`.

Hierarchy loading creates all ordinary and instance-added components before resolving component properties and calls. References use the template component order plus additions; removals run afterward, so deleting a component does not shift a selector before its reference is resolved. Scene and Prefab loading share this lifecycle.
