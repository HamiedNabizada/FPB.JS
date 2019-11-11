import {
    isString,
    isFunction,
    assign
  } from 'min-dash';
  
  import Moddle from 'moddle';
    
  export default function FpbjsModdle(packages, options) {
    Moddle.call(this, packages, options);
  }
  
  FpbjsModdle.prototype = Object.create(Moddle.prototype);

  