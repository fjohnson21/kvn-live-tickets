(()=>{
 const form=document.getElementById('secretForm'),field=document.getElementById('secret'),status=document.getElementById('status'),button=document.getElementById('save'),login=document.getElementById('login');let challenge;
 async function refresh(){const r=await fetch('/api/paypal-setup/key',{cache:'no-store',credentials:'same-origin'});const data=await r.json();if(!r.ok){if(r.status===401)login.hidden=false;throw Error(data.error||'Owner access is required.');}challenge=data;form.hidden=false;return data;}
 refresh().then(data=>{status.textContent=data.configured?'A Secret is already saved. Submit only if you need to replace it.':'Owner access confirmed. Ready for encrypted entry.';}).catch(error=>{status.textContent=error.message;});
 form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;status.textContent='Encrypting and verifying your connection…';try{
  // Fresh one-use challenge, bound by the server to the signed-in owner session.
  await refresh();const key=await crypto.subtle.importKey('jwk',challenge.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const plaintext=new TextEncoder().encode(JSON.stringify({nonce:challenge.nonce,secret:field.value.trim()}));field.value='';const encrypted=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,plaintext);plaintext.fill(0);
  const ciphertext=btoa(String.fromCharCode(...new Uint8Array(encrypted)));const response=await fetch('/api/paypal-setup/secret',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ciphertext})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save Secret.');form.hidden=true;status.textContent='Secret saved securely. PayPal accepted the connection. Return to the chat and say “saved” so we can finish payment notifications and testing.';
 }catch(error){status.textContent=error.message;field.value='';}finally{button.disabled=false;}});
})();
