const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function createSocialMailer({apiKey,from='KV Social <social@tickets.kvnlive.com>'}={}){
  return async function send({to,name='',kind,url}={}){
    if(!apiKey)throw Object.assign(new Error('Transactional email is not configured.'),{status:503});
    if(!to||!url)throw new Error('Email recipient and link are required.');
    const verify=kind==='verify';
    const subject=verify?'Verify your KV Social account':'Reset your KV Social password';
    const heading=verify?'Verify your email':'Reset your password';
    const body=verify
      ?'Confirm this email address to activate your KV Social account.'
      :'Use this secure link to choose a new KV Social password. This link expires soon.';
    const button=verify?'Verify email':'Reset password';
    const html=`<!doctype html><html><body style="margin:0;background:#f5f4f1;font-family:Arial,Helvetica,sans-serif;color:#171717"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e4e1da;border-radius:14px"><tr><td style="padding:34px"><div style="font-size:12px;letter-spacing:2px;font-weight:700">KV SOCIAL</div><h1 style="font-size:30px;line-height:1.1;margin:18px 0 14px">${heading}</h1><p style="font-size:14px;line-height:1.7">Hi ${esc(name||'there')},</p><p style="font-size:14px;line-height:1.7">${body}</p><p style="margin:28px 0"><a href="${esc(url)}" style="background:#171717;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px;display:inline-block;font-weight:700">${button}</a></p><p style="font-size:12px;line-height:1.7;color:#686868">If you did not request this, you can ignore this email.</p><p style="font-size:11px;line-height:1.7;color:#8a8a8a">Faith. Purpose. Community. Impact.</p></td></tr></table></td></tr></table></body></html>`;
    const text=`${heading}\n\nHi ${name||'there'},\n\n${body}\n\n${url}\n\nIf you did not request this, you can ignore this email.`;
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({from,to:[to],subject,html,text})
    });
    if(!response.ok){
      let detail='';try{detail=(await response.json())?.message||'';}catch{}
      throw Object.assign(new Error(detail||'Unable to send account email.'),{status:502});
    }
    return response.json();
  };
}
