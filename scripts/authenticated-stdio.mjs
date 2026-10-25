import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
const endpoint=process.env.CLASSROOM_API_ORIGIN,token=process.env.CLASSROOM_API_KEY;
if(!endpoint || !token || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint))throw new Error("Configure the local classroom API env fields");
const server=new McpServer({name:"classroom-stdio-auth",version:"1.0.0"});
server.registerTool("course_card",{description:"Fetch the classroom course card using credentials from the server environment",inputSchema:{},annotations:{readOnlyHint:true}},async()=>{
 const response=await fetch(endpoint+"/data",{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});
 if(!response.ok)return {isError:true,content:[{type:"text",text:"Classroom API authentication failed: "+response.status}]};
 return {content:[{type:"text",text:JSON.stringify(await response.json())}]};
});
await server.connect(new StdioServerTransport());
