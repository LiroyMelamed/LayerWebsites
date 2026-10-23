// Compatibility for the currently published legal login bundle.
// The source LoginScreen also carries these explicit accessible attributes.
(() => {
  const update = () => {
    document.querySelectorAll('.lw-loginScreen__input input[type="tel"]').forEach(input => {
      const wrapper=input.closest('.lw-loginScreen__input');
      const label=wrapper.querySelector('.lw-simpleInput__label');
      if(!input.hasAttribute('aria-label')&&!input.hasAttribute('aria-labelledby')) input.setAttribute('aria-label','נא הזן מספר פלאפון');
      const invalid=wrapper.classList.contains('has-error');
      input.setAttribute('aria-invalid',String(invalid));
      if(label && invalid){
        if(!label.id)label.id='mela-login-phone-error';
        input.setAttribute('aria-describedby',label.id);
      } else if(input.getAttribute('aria-describedby')==='mela-login-phone-error') input.removeAttribute('aria-describedby');
    });
  };
  update();
  new MutationObserver(update).observe(document.getElementById('root')||document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();
