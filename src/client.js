'use strict';
const {spawn} = require('node:child_process');
const {EventEmitter} = require('node:events');
const {StringDecoder} = require('node:string_decoder');
class CodexClient extends EventEmitter {
  constructor(executable, cwd) { super(); this.executable=executable; this.cwd=cwd; this.pending=new Map(); this.seq=0; }
  async start() {
    if(this.ready) return this.ready;
    this.ready=this.connect().catch(e=>{ this.close(); throw e; }); return this.ready;
  }
  async connect() {
    this.proc=spawn(this.executable,['app-server','--stdio'],{cwd:this.cwd,stdio:['pipe','pipe','pipe'],env:{...process.env,PATH:`/opt/homebrew/bin:/usr/local/bin:${process.env.PATH||''}`}});
    this.proc.stdin.on('error',()=>{});
    let buffer='', decoder=new StringDecoder('utf8'); this.stderr='';
    this.proc.stderr.on('data',b=>{this.stderr=(this.stderr+b.toString()).slice(-3000);});
    this.proc.stdout.on('data',b=>{buffer+=decoder.write(b); let n; while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n); buffer=buffer.slice(n+1); try{this.dispatch(JSON.parse(line));}catch(e){this.emit('protocolError',e);}}});
    this.proc.on('error',e=>this.fail(e));
    this.proc.on('exit',(code)=>{this.fail(new Error(`Codex 已断开 (${code ?? '停止'})`));this.proc=null;this.ready=null;});
    const r=await this.request('initialize',{clientInfo:{name:'obsidian_codex_companion',title:'Codex Notes Companion',version:'0.3.2'},capabilities:{experimentalApi:true}});
    this.write({method:'initialized',params:{}}); return r;
  }
  dispatch(msg) {
    if(msg.method){this.emit(msg.id!==undefined?'request':'notification',msg);return;}
    const p=this.pending.get(msg.id); if(!p)return; this.pending.delete(msg.id); clearTimeout(p.timer);
    if(msg.error)p.reject(new Error(msg.error.message||JSON.stringify(msg.error)));else p.resolve(msg.result);
  }
  write(msg){if(!this.proc?.stdin.writable)throw new Error('Codex 未连接');this.proc.stdin.write(JSON.stringify(msg)+'\n');}
  request(method,params={}){
    return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} 请求超时，请重试连接`));},60000);this.pending.set(id,{resolve,reject,timer});try{this.write({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
  }
  respond(id,result){this.write({id,result});}
  unsupported(id){this.write({id,error:{code:-32601,message:'This client does not support this interactive request.'}});}
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();this.emit('disconnect',e);}
  close(){this.ready=null;this.proc?.kill('SIGTERM');}
}
module.exports={CodexClient};
