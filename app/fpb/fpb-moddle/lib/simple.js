import {
    assign
  } from 'min-dash';
  
  import FpbjsModdle from './fpbjs-moddle';
  
  import FpbjsPackage from '../resources/fpbjs.json';
  import FpbjsDiPackage from '../resources/fpbjsdi.json';
  import DcPackage from '../resources/dc.json';
  import DiPackage from '../resources/di.json';
  import FpbPackage from '../resources/fpb.json';
  import FpbCharacteristics from '../resources/fpb_characteristics.json';

  
  var packages = {
    fpb: FpbPackage,
    fpbch: FpbCharacteristics,
    fpbjs: FpbjsPackage,
    fpbjsdi: FpbjsDiPackage,
    dc: DcPackage,
    di: DiPackage
  };
  
  export default function(additionalPackages, options) {
    var pks = assign({}, packages, additionalPackages);
  
    return new FpbjsModdle(pks, options);
  }
  