A subpackage of `@galacean/engine`.

Hierarchy loading applies structural overrides before resolving component properties and calls. References preserve their component and child indices across removals. Component indices preserve the loaded template order and follow the authored order for additions in the current file, independent of dependency construction order. Scene and Prefab loading share this lifecycle.
