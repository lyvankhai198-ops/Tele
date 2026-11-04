type Completion={id:string;status:string;processed?:number;updatedCount?:number;finishedAt?:string|null};
const receipts=new Map<string,string>();
function key(scope:string,kind:string){return `telecamp:completion:${kind}:${scope}`;}
function stamp(job:Completion){return JSON.stringify([job.id,job.status,job.processed??null,job.updatedCount??null,job.finishedAt??null]);}
export function wasCampaignCompletionHandled(scope:string,kind:string,job:Completion){
  if(!["completed","failed"].includes(job.status))return false;
  const name=key(scope,kind);
  let previous=receipts.get(name);
  try{previous=localStorage.getItem(name)??previous;}catch{/* private browsing: in-memory receipt still works */}
  return previous===stamp(job);
}
export function claimCampaignCompletion(scope:string,kind:string,job:Completion){
  if(!["completed","failed"].includes(job.status)||wasCampaignCompletionHandled(scope,kind,job))return false;
  const name=key(scope,kind),value=stamp(job);
  receipts.set(name,value);
  if(receipts.size>128){const oldest=receipts.keys().next().value;if(oldest)receipts.delete(oldest);}
  try{localStorage.setItem(name,value);}catch{/* receipt contains only operation identity, never campaign content */}
  return true;
}
