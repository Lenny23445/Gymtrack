/* LIQUID GLASS — Tab-Bar beim Runterscrollen zu Kapsel minimieren (reversibel).
   Capture-Listener fängt auch innere Scroll-Container (.pg) ab. */
(function(){
  function init(){
    var tb=document.querySelector('.tabbar'); if(!tb) return;
    var last=0, resnapT=null;
    // Nach dem Größenwechsel sitzt die Auswahl-Pille sonst auf der alten Position/Breite
    // → nach Ende der Padding-Transition (~.32s) einmal sauber nachmessen.
    function resnap(){
      clearTimeout(resnapT);
      resnapT=setTimeout(function(){
        try{ var a=document.querySelector('.tab.on'); if(a&&typeof moveTabIndicator==='function') moveTabIndicator(a); }catch(_){}
      },340);
    }
    function onScroll(e){
      var el=e.target;
      var y=(el&&typeof el.scrollTop==='number')?el.scrollTop:(window.scrollY||window.pageYOffset||0);
      if(typeof y!=='number') return;
      if(y<0) y=0;   // iOS-Rubber-Band: Overscroll nicht als "hoch scrollen" werten
      var min=tb.classList.contains('tabbar--min');
      // Größere Hysterese (10px) + Zustands-Check: kein Flackern mitten in der Animation
      if(!min && y>last+10 && y>44){ tb.classList.add('tabbar--min'); resnap(); }
      else if(min && (y<last-10 || y<=44)){ tb.classList.remove('tabbar--min'); resnap(); }
      last=y;
    }
    document.addEventListener('scroll', onScroll, {capture:true, passive:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
