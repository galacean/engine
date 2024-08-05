---
order: 9
title: Time
type: Core
label: Core
---

`Time` contains information related to engine time:

## Properties

| Name                                                   | Description                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeScale](/apis/core/#Time-timeScale)             | Time scaling                                                                                                                                             |
| [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) | Maximum interval, in case of low frame rate or stuttering                                                                                                 |
| [frameCount](/apis/core/#Time-frameCount)           | The cumulative number of frames since the engine started                                                                                                 |
| [deltaTime](/apis/core/#Time-deltaTime)             | The incremental time from the previous frame to the current frame, in seconds, not exceeding [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) \* [timeScale](/apis/core/#Time-timeScale) |
| [actualDeltaTime](/apis/core/#Time-actualDeltaTime) | The actual incremental time from the previous frame to the current frame, in seconds, ignoring the effects of [timeScale](/apis/core/#Time-timeScale) and [maximumDeltaTime](/apis/core/#Time-maximumDeltaTime) |
| [elapsedTime](/apis/core/#Time-elapsedTime)         | The cumulative elapsed time since the engine started, in seconds                                                                                         |
| [actualElapsedTime](/apis/core/#Time-actualElapsedTime) | The cumulative elapsed time since the engine started, in seconds                                                                                         |

