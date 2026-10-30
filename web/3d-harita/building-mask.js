import {buildingMaskFilter} from './stadium-site.js';
// Several landmarks hide the generic building-3d extrusions they replace.
// One shared mask keeps their exclusions combined and the original filter intact.
export function createBuildingMask(map){
 let original,signature='';
 const sets=new Map();
 function apply(){
  if(!map.getLayer('building-3d'))return;
  if(original===undefined)original=map.getFilter('building-3d')||null;
  const ids=[...new Set([...sets.values()].flat())].sort();
  const key=JSON.stringify(ids);
  if(key===signature)return;
  signature=key;map.setFilter('building-3d',buildingMaskFilter(original,ids));
 }
 return {set(name,ids){sets.set(name,[...ids]);apply();},restore(){sets.clear();if(original!==undefined&&map.getLayer('building-3d'))map.setFilter('building-3d',original);signature='';}};
}
