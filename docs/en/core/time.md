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
| [timeScale](/en/apis/core/#Time-timeScale)             | Time scaling                                                                                                                                             |
| [maximumDeltaTime](/en/apis/core/#Time-maximumDeltaTime) | Maximum interval, in case of low frame rate or stuttering                                                                                                 |
| [frameCount](/en/apis/core/#Time-frameCount)           | The cumulative number of frames since the engine started                                                                                                 |
| [deltaTime](/en/apis/core/#Time-deltaTime)             | The incremental time from the previous frame to the current frame, in seconds, not exceeding [maximumDeltaTime](/en/apis/core/#Time-maximumDeltaTime) \* [timeScale](/en/apis/core/#Time-timeScale) |
| [actualDeltaTime](/en/apis/core/#Time-actualDeltaTime) | The actual incremental time from the previous frame to the current frame, in seconds, ignoring the effects of [timeScale](/en/apis/core/#Time-timeScale) and [maximumDeltaTime](/en/apis/core/#Time-maximumDeltaTime) |
| [elapsedTime](/en/apis/core/#Time-elapsedTime)         | The cumulative elapsed time since the engine started, in seconds                                                                                         |
| [actualElapsedTime](/en/apis/core/#Time-actualElapsedTime) | The cumulative elapsed time since the engine started, in seconds                                                                                         |

