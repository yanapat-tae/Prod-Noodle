// Type-check Edge source locally; real execution/deployment uses Deno.
declare const Deno: { env: { get(name:string):string|undefined }; serve(handler:(req:Request)=>Promise<Response>):void };
