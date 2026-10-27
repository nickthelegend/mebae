// Pass-through instrumentation. Every wrapped native operation executes unchanged.
export const instrument=()=>{
 if(window.__t10)return;
 const a=window.__t10={contexts:[],audio:[],gl:{texImage2D:0,texSubImage2D:0},sand:{texImage2D:0,texSubImage2D:0}};
 const clear=CanvasRenderingContext2D.prototype.clearRect,fill=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.clearRect=function(...args){this.canvas.__auditText=[];return clear.apply(this,args);};
 CanvasRenderingContext2D.prototype.fillText=function(t,...args){(this.canvas.__auditText??=[]).push(String(t));return fill.call(this,t,...args);};
 if(window.AudioContext){const C=window.AudioContext;window.AudioContext=new Proxy(C,{construct(target,args){const c=Reflect.construct(target,args);a.contexts.push(c);return c;}});}
 if(window.OscillatorNode){const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){a.audio.push({at:performance.now(),when:args[0],frequency:this.frequency.value,state:this.context.state});return start.apply(this,args);};}
 for(const C of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(C)for(const name of ['texImage2D','texSubImage2D']){const old=C.prototype[name];C.prototype[name]=function(...args){a.gl[name]++;if(a.sandTexture&&this.getParameter(this.TEXTURE_BINDING_2D)===a.sandTexture)a.sand[name]++;return old.apply(this,args);};}
};
