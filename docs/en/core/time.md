---
order: 9
title: Time
type: Core
label: Core
---

`Time` contains information related to the engine's time:

## Properties

| Name                                                   | Description                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeScale](/apis/core/#Time-timeScale)                 | The time scale                                                                                                                                           |
| [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime)   | The maximum interval, in case of low frame rate or lag                                                                                                    |
| [frameCount](/apis/core/#Time-frameCount)               | The total number of frames accumulated since the engine started                                                                                          |
| [deltaTime](/apis/core/#Time-deltaTime)                 | The incremental time from the previous frame to the current frame, in seconds, will not exceed [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) \* [timeScale](/apis/core/#Time-timeScale) |
| [actualDeltaTime](/apis/core/#Time-actualDeltaTime)     | The actual incremental time from the previous frame to the current frame, in seconds, and ignores the impact of [timeScale](/apis/core/#Time-timeScale) and [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) |
| [elapsedTime](/apis/core/#Time-elapsedTime)             | The total elapsed time since the engine started, in seconds                                                                                              |
| [actualElapsedTime](/apis/core/#Time-actualElapsedTime) | The total elapsed time since the engine started, in seconds                                                                                              |
