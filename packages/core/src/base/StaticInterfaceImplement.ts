/**
 *  Static interface implement decorator.
 *  https://stackoverflow.com/questions/13955157/how-to-define-static-property-in-typescript-interface
 */
export function StaticInterfaceImplement<T>() {
  return <U extends T>(constructor: U) => {
    constructor;
  };
}
