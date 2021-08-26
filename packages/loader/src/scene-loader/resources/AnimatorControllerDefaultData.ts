export const getAnimatorControllerDefaultData = ({
  stateName,
  clipAssetId
}) => {
  
  return {
    "animatorController": {
      "currentLayerIndex": 0,
      "layers": [
        {
          "name": "Base",
          "weight": 1,
          "blending": 0,
          "stateMachine": {
            "states": [
              {
                "name": `${stateName}`,
                "clip": {
                  "type": "asset",
                  "id": clipAssetId
                },
                "wrapMode": 1,
                "speed": 1,
                "clipStartNormalizedTime": 0,
                "clipEndNormalizedTime": 1,
                "transitions": []
              }
            ]
          },
          "_stateMachineGraphData": {
            "cells": [
              {
                "position": {
                  "x": 120,
                  "y": 50
                },
                "size": {
                  "width": 140,
                  "height": 50
                },
                "view": "react-shape-view",
                "shape": "state",
                "component": "AnimatorState",
                "ports": {
                  "groups": {
                    "in": {
                      "position": "left",
                      "label": {
                        "position": "left"
                      },
                      "attrs": {
                        "circle": {
                          "r": 5,
                          "magnet": true,
                          "fill": "#72a836"
                        }
                      }
                    },
                    "out": {
                      "position": "right",
                      "label": {
                        "position": "right"
                      },
                      "attrs": {
                        "circle": {
                          "r": 5,
                          "magnet": true,
                          "fill": "#72a836"
                        }
                      }
                    }
                  },
                  "items": [
                    {
                      "id": "out",
                      "group": "out"
                    }
                  ]
                },
                "id": "entry",
                "stateType": 0,
                "prev": null,
                "next": null,
                "isEntryState": true,
                "isAnyState": false,
                "isExitState": false,
                "_view": null,
                "data": {
                  "name": "entry",
                  "clip": null,
                  "wrapMode": 0,
                  "speed": 1,
                  "clipStartNormalizedTime": 0,
                  "clipEndNormalizedTime": 1,
                  "transitions": [
                    {
                      "duration": 1,
                      "offset": 0,
                      "exitTime": 0.3,
                      "targetStateName": `${stateName}`
                    }
                  ]
                },
                "zIndex": 1
              },
              {
                "position": {
                  "x": 360,
                  "y": 320
                },
                "size": {
                  "width": 140,
                  "height": 50
                },
                "view": "react-shape-view",
                "shape": "state",
                "component": "AnimatorState",
                "ports": {
                  "groups": {
                    "in": {
                      "position": "left",
                      "label": {
                        "position": "left"
                      },
                      "attrs": {
                        "circle": {
                          "r": 5,
                          "magnet": true,
                          "fill": "#72a836"
                        }
                      }
                    },
                    "out": {
                      "position": "right",
                      "label": {
                        "position": "right"
                      },
                      "attrs": {
                        "circle": {
                          "r": 5,
                          "magnet": true,
                          "fill": "#72a836"
                        }
                      }
                    }
                  },
                  "items": [
                    {
                      "id": "in",
                      "group": "in"
                    }
                  ]
                },
                "id": "exit",
                "stateType": 2,
                "prev": null,
                "next": null,
                "isEntryState": false,
                "isAnyState": false,
                "isExitState": true,
                "_view": null,
                "data": {
                  "name": "exit",
                  "clip": null,
                  "wrapMode": 0,
                  "speed": 1,
                  "clipStartNormalizedTime": 0,
                  "clipEndNormalizedTime": 1,
                  "transitions": []
                },
                "zIndex": 2
              },
              {
                "position": {
                  "x": 400,
                  "y": 50
                },
                "size": {
                  "width": 140,
                  "height": 50
                },
                "view": "react-shape-view",
                "shape": "state",
                "component": "AnimatorState",
                "ports": {
                  "groups": {
                    "in": {
                      "position": "left",
                      "label": {
                        "position": "left"
                      },
                      "attrs": {
                        "circle": {
                          "r": 5,
                          "magnet": true,
                          "fill": "#72a836"
                        }
                      }
                    },
                    "out": {
                      "position": "right",
                      "label": {
                        "position": "right"
                      },
                      "attrs": {
                        "circle": {
                          "r": 5,
                          "magnet": true,
                          "fill": "#72a836"
                        }
                      }
                    }
                  },
                  "items": [
                    {
                      "id": "in",
                      "group": "in"
                    },
                    {
                      "id": "out",
                      "group": "out"
                    }
                  ]
                },
                "id": `${stateName}`,
                "stateType": 3,
                "prev": null,
                "next": null,
                "isEntryState": false,
                "isAnyState": false,
                "isExitState": false,
                "_view": null,
                "data": {
                  "name": `${stateName}`,
                  "clip": {
                    "type": "asset",
                    "id": clipAssetId
                  },
                  "wrapMode": 1,
                  "speed": 1,
                  "clipStartNormalizedTime": 0,
                  "clipEndNormalizedTime": 1,
                  "transitions": []
                },
                "zIndex": 3
              },
              {
                "shape": "edge",
                "attrs": {
                  "line": {
                    "stroke": "#86d530",
                    "strokeWidth": 1,
                    "targetMarker": {
                      "name": "block",
                      "args": {
                        "size": "6"
                      }
                    },
                    "strokeDasharray": "20,5,5,5,5,5"
                  }
                },
                "id": "36ce94e2-3692-43af-87bc-4981b9fcaf4d",
                "data": {
                  "duration": 1,
                  "offset": 0,
                  "exitTime": 0.3,
                  "targetStateName": `${stateName}`
                },
                "_view": null,
                "connector": {
                  "name": "curve"
                },
                "source": {
                  "cell": "entry",
                  "port": "out"
                },
                "target": {
                  "cell": `${stateName}`,
                  "port": "in"
                },
                "zIndex": 4
              },
              {
                "shape": "edge",
                "attrs": {
                  "line": {
                    "stroke": "#86d530",
                    "strokeWidth": 1,
                    "targetMarker": {
                      "name": "block",
                      "args": {
                        "size": "6"
                      }
                    },
                    "strokeDasharray": "20,5,5,5,5,5"
                  }
                },
                "id": "165ef4cc-50f0-464d-a649-a524e85000b8",
                "data": {
                  "duration": 1,
                  "offset": 0,
                  "exitTime": 0.3,
                  "targetStateName": "exit"
                },
                "_view": null,
                "connector": {
                  "name": "curve"
                },
                "source": {
                  "cell": `${stateName}`,
                  "port": "out"
                },
                "target": {
                  "cell": "exit",
                  "port": "in"
                },
                "zIndex": 5
              }
            ]
          }
        }
      ]
    }
  }
}
