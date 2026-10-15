export default function useHttpRequest(){return {isPerforming:false,performRequest:()=>{throw Error('QA preview blocks all API writes')}};}
