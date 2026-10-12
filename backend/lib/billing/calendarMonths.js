'use strict';
function addIsraelCalendarMonths(from,months) {
    const date=new Date(from);
    if(!Number.isFinite(date.getTime())||!Number.isInteger(months))throw Error('INVALID_CALENDAR_DATE');
    const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const wall=value=>{
        const p=Object.fromEntries(formatter.formatToParts(value).map(x=>[x.type,x.value]));
        return new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second)));
    };
    const target=wall(date),day=target.getUTCDate();target.setUTCDate(1);target.setUTCMonth(target.getUTCMonth()+months);
    target.setUTCDate(Math.min(day,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));
    let candidate=target.getTime();const seen=[];
    for(let n=0;n<5;n++){
        const delta=target.getTime()-wall(new Date(candidate)).getTime();
        if(delta===0)return new Date(candidate+date.getUTCMilliseconds());
        candidate+=delta;
        if(seen.includes(candidate))return new Date(Math.max(...seen,candidate)+date.getUTCMilliseconds()); // DST gap: after the gap.
        seen.push(candidate);
    }
    throw Error('INVALID_CALENDAR_TIME');
}
module.exports={addIsraelCalendarMonths};
