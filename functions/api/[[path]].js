export async function onRequest({request,env}) {
  if (!env.MOAPLAN_API_URL || !env.MOAPLAN_PROXY_SECRET) return Response.json({error:'Server is not configured'},{status:503});
  const incoming=new URL(request.url);
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('Origin') !== incoming.origin) return new Response('Forbidden',{status:403});
  const target=new URL(env.MOAPLAN_API_URL);
  target.pathname=target.pathname.replace(/\/$/,'')+incoming.pathname;
  target.search=incoming.search;
  const headers=new Headers(request.headers);
  headers.delete('Host'); headers.delete('Authorization');
  headers.set('x-moaplan-proxy',env.MOAPLAN_PROXY_SECRET);
  headers.set('x-forwarded-for',request.headers.get('cf-connecting-ip')||'unknown');
  const response=await fetch(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
  const output=new Response(response.body,response);
  output.headers.set('Cache-Control','no-store');
  return output;
}
