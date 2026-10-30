import {createStadiumModel} from './stadium-model.js';
import ramsSite from './data/stadium-site.json';
import {isStadiumFeature} from './stadium-site.js';

// A single procedural landmark, georeferenced to retrieved OSM pitch/outline.
export function mountStadium(map,root,toLocal,buildingMask,options={}){
 const site=options.site||ramsSite,key=options.key||'stadium',view={zoom:17.1,bearing:-35,...(options.focus||{})};
 const model=createStadiumModel(options.model||{});
 model.group.position.fromArray(toLocal(site.center));
 model.group.rotation.z=site.rotationRadians;
 model.group.visible=false;
 root.add(model.group);
 let roofVisible=true,maskTimer;
 const masks=new Set();
 const button=document.querySelector(options.button||'#stadium-focus');
 button.disabled=false;
 const info=document.querySelector(options.info||'#stadium-info');
 const roofButton=document.querySelector(options.roof||'#stadium-roof');
 function visible(){const c=map.getCenter();return map.getZoom()>=14.5&&Math.hypot((c.lng-site.center[0])*.75,c.lat-site.center[1])<.025;}
 function update(){model.group.visible=visible();info.hidden=!model.group.visible;}
 function mask(){
  if(!map.getLayer('building-3d'))return;
  if(visible()){
   for(const feature of map.querySourceFeatures('openmaptiles',{sourceLayer:'building'})){
    if(feature.id!==undefined&&isStadiumFeature(feature,site.center))masks.add(feature.id);
   }
  }
  buildingMask.set(key,visible()?[...masks]:[]);
 }
 function queueMask(event){if(event?.sourceId&&event.sourceId!=='openmaptiles')return;clearTimeout(maskTimer);maskTimer=setTimeout(mask,60);}
 function focus(){
  const panelToggle=document.querySelector('#panel-toggle');
  if(panelToggle.getAttribute('aria-expanded')==='true')panelToggle.click();
  map.easeTo({center:site.center,zoom:view.zoom,pitch:57,bearing:view.bearing,padding:{top:80,bottom:80,left:35,right:35},duration:1100});
  model.group.visible=true;info.hidden=false;map.triggerRepaint();
 }
 function toggleRoof(){
  if(!model.setRoofVisible)return;
  roofVisible=!roofVisible;model.setRoofVisible(roofVisible);
  roofButton.textContent=roofVisible?'Çatıyı gizle':'Çatıyı göster';
  roofButton.setAttribute('aria-pressed',String(!roofVisible));
  map.triggerRepaint();
 }
 button.addEventListener('click',focus);
 roofButton.addEventListener('click',toggleRoof);
 roofButton.hidden=typeof model.setRoofVisible!=='function';
 map.on('sourcedata',queueMask);map.on('moveend',queueMask);
 return {focus,update,getState:()=>({visible:model.group.visible,roofVisible,maskedBuildingIds:[...masks],center:site.center,stats:model.stats}),dispose(){
  clearTimeout(maskTimer);map.off('sourcedata',queueMask);map.off('moveend',queueMask);
  button.removeEventListener('click',focus);roofButton.removeEventListener('click',toggleRoof);
  buildingMask.set(key,[]);
  root.remove(model.group);model.dispose();
 }};
}
