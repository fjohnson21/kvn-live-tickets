const paths=new Set(['/passes','/passes/confirmation','/checkout','/shop','/shop/success','/promo','/give','/give/confirmation']);
export function buildCustomerUrl(path,query={},origin='https://kvnlive.com'){
 if(!['https://kvnlive.com','https://www.kvnlive.com'].includes(origin)||!paths.has(path))throw new Error('Invalid customer destination.');
 const url=new URL(path,origin);for(const [key,value] of Object.entries(query))if(value!==undefined)url.searchParams.set(key,String(value));
 return url.toString().replace(/%7BCHECKOUT_SESSION_ID%7D/g,'{CHECKOUT_SESSION_ID}');
}
