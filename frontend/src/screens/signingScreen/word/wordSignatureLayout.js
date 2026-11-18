// Preview only. The server independently resolves and validates each anchor
// again against the filled Word output before creating a signing document.
export function signatureSpots(authoring,anchors,verifiedPages){
    return anchors.flatMap(anchor=>{
        const hits=authoring.pages.flatMap(page=>page.items.filter(item=>!item.readOnlyReason&&item.segments.some(segment=>segment.part===anchor.part&&segment.paragraphId===anchor.paragraphId&&segment.sourceStart<anchor.end&&segment.sourceEnd>anchor.start)).map(item=>({page,item})));
        if(new Set(hits.map(hit=>hit.page.pageNum)).size!==1)return [];
        const first=hits.find(({item})=>item.segments.some(segment=>segment.part===anchor.part&&segment.paragraphId===anchor.paragraphId&&segment.sourceStart<=anchor.start&&segment.sourceEnd>anchor.start));
        if(!first||verifiedPages[first.page.pageNum]!=='verified'||!anchor.placement)return [];
        const {page,item}=first,[a,b,c,d,e,f]=page.viewportTransform||[],matrix=item.transform||[];
        if(page.rotation!==0||matrix[1]!==0||matrix[2]!==0||matrix[0]<=0||matrix[3]<=0)return [];
        const scale=800/page.width,px=matrix[4],py=matrix[5]+item.height,p=anchor.placement;
        const x=(a*px+c*py+e)*scale+p.offsetX,y=(b*px+d*py+f)*scale+p.offsetY;
        if(![x,y,p.width,p.height].every(Number.isFinite))return [];
        return [{id:anchor.id,fieldType:'signature',type:'signature',pageNum:page.pageNum,x,y,width:p.width,height:p.height,
            signerIndex:anchor.signerIndex||0,signerName:anchor.fieldLabel,isRequired:anchor.required!==false}];
    });
}
