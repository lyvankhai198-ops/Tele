import {useQuery,useQueryClient} from "@tanstack/react-query";
import {createOperation,listOperations,retryOperation,type BackgroundOperationInput} from "@workspace/api-client-react";
import {useAuth} from "@/lib/auth";
export function useOperations({follow=false}:{follow?:boolean}={}){
  const {user}=useAuth(),client=useQueryClient();
  const scope=user?`${user.id}:${user.support?.targetUserId??"self"}`:"";
  const queryKey=["telecamp-operations",scope];
  const query=useQuery({queryKey,queryFn:()=>listOperations(),enabled:!!scope,staleTime:1000,
    refetchInterval:q=>follow||q.state.data?.some(j=>j.state==="queued"||j.state==="running")?2000:15000});
  const start=async(input:BackgroundOperationInput)=>{
    // The job is discoverable by owner even if the acceptance response is lost.
    const id=crypto.randomUUID();
    try{return await createOperation(input,{headers:{"Idempotency-Key":id}});}
    finally{void client.invalidateQueries({queryKey});}
  };
  const retry=async(id:string)=>{try{return await retryOperation(id);}finally{void client.invalidateQueries({queryKey});}};
  return {...query,start,retry,scope};
}
