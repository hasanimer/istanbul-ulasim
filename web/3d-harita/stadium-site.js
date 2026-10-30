// Match the stadium shell by its OUTER ring; its roof hole contains the pitch.
function contains(ring,p){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
export function isStadiumFeature(feature,center){
 const geometry=feature.geometry;
 if(geometry?.type==='Polygon')return contains(geometry.coordinates[0],center);
 if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(p=>contains(p[0],center));
 return false;
}
export function buildingMaskFilter(original,ids){
 const unique=[...new Set(ids)];
 if(!unique.length)return original;
 const exclusion=['!', ['in', ['id'], ['literal',unique]]];
 return original?['all',original,exclusion]:exclusion;
}
