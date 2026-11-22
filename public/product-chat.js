(() => {
  if (document.getElementById('sb-product-chat')) return;

  const make = (tag, value, attrs = {}) => {
    const element = document.createElement(tag);
    if (value != null) element.textContent = value;
    for (const [name, attr] of Object.entries(attrs)) element.setAttribute(name, attr);
    return element;
  };
  const icons = {
    robot: '<rect x="4.5" y="8" width="15" height="12" rx="3"/><path d="M12 8V5m-10 7v4m20-4v4"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="9" cy="14" r=".85" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r=".85" fill="currentColor" stroke="none"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    send: '<path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/>',
  };
  function icon(name) {
    const container = make('span', null, {class:'sb-chat-icon','aria-hidden':'true'});
    container.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">'+icons[name]+'</svg>';
    return container;
  }
  const control = (name, label, attrs = {}) => {
    const button = make('button', null, {type:'button','aria-label':label,title:label,...attrs});
    button.append(icon(name));
    return button;
  };

  document.head.append(make('link',null,{rel:'stylesheet',href:'/product-chat.css'}));
  const widget = make('aside',null,{id:'sb-product-chat','aria-label':'Tư vấn sản phẩm Sneaker Buzz'});
  const open = control('robot','Mở chatbot Sneaker Buzz',{class:'sb-chat-toggle','aria-expanded':'false','aria-controls':'sb-chat-panel'});
  const panel = make('section',null,{id:'sb-chat-panel',hidden:'','aria-labelledby':'sb-chat-title'});
  const header = make('div',null,{class:'sb-chat-header'});
  const identity = make('div',null,{class:'sb-chat-identity'});
  const avatar = make('span',null,{class:'sb-chat-avatar'});
  avatar.append(icon('robot'));
  identity.append(avatar,make('h2','Sneaker Buzz',{id:'sb-chat-title'}));
  const close = control('close','Thu gọn chatbot',{class:'sb-chat-close'});
  header.append(identity,close);

  const log = make('div',null,{class:'sb-chat-log',role:'log','aria-label':'Tin nhắn tư vấn','aria-live':'polite',tabindex:'0'});
  const form = make('form',null,{class:'sb-chat-compose'});
  const input = make('input',null,{required:'',maxlength:'350',autocomplete:'off',placeholder:'Nhập tin nhắn…','aria-label':'Nhập tin nhắn'});
  const send = control('send','Gửi tin nhắn',{type:'submit',class:'sb-chat-send'});
  form.append(input,send);
  panel.append(header,log,form);
  widget.append(panel,open);
  document.body.append(widget);

  let request = null;
  const customerService = document.querySelector('a[href^="https://zalo.me/"]')?.href || 'https://zalo.me/2233414181380294594';

  function botMessage() {
    const row = make('div',null,{class:'sb-chat-bot'});
    const content = make('div',null,{class:'sb-chat-content'});
    const bubble = make('div',null,{class:'sb-chat-bubble'});
    content.append(bubble,make('small','Gửi bởi chatbot',{class:'sb-chat-byline'}));
    row.append(avatar.cloneNode(true),content);
    log.append(row);
    return {row,bubble};
  }
  function startConversation() {
    log.replaceChildren();
    const {bubble} = botMessage();
    bubble.append(make('p','Chào bạn! Bạn đang tìm sản phẩm nào? Cho mình biết mẫu, màu, size hoặc khoảng giá nhé.'));
    const suggestions = make('div',null,{class:'sb-chat-options'});
    for (const example of ['Giày Vans đen dưới 2 triệu','Balo đen dưới 1 triệu']) {
      const chip = make('button',example,{type:'button'});
      chip.onclick = () => {
        if (request) return;
        input.value = example;
        form.requestSubmit();
      };
      suggestions.append(chip);
    }
    bubble.append(suggestions);
  }
  function toggle(visible) {
    if (visible && !log.childElementCount) startConversation();
    panel.hidden = !visible;
    widget.classList.toggle('sb-chat-open',visible);
    open.setAttribute('aria-expanded',String(visible));
    (visible?input:open).focus();
    if (visible) log.scrollTop=log.scrollHeight;
  }
  open.onclick = () => toggle(panel.hidden);
  close.onclick = () => toggle(false);
  widget.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !panel.hidden) toggle(false);
  });
  function endConversation() {
    request?.abort();
    request = null;
    input.value = '';
    send.disabled = false;
    log.replaceChildren();
    toggle(false);
  }
  function helpMessage() {
    const {bubble} = botMessage();
    bubble.append(make('p','Vẫn cần trợ giúp?'));
    const options = make('div',null,{class:'sb-chat-options'});
    const contact = make('a','Nhắn nhân viên qua Zalo',{href:customerService,target:'_blank',rel:'noopener noreferrer'});
    const end = make('button','Kết thúc chat',{type:'button'});
    end.onclick = endConversation;
    options.append(contact,end);
    bubble.append(options,make('small','Bạn có thể nhắn thêm để tiếp tục.',{class:'sb-chat-hint'}));
  }

  function productCard(product) {
    const card = make('a',null,{href:product.url,class:'sb-chat-product','aria-label':'Xem '+product.title});
    if (product.image) {
      const image = make('img',null,{src:product.image,alt:'',loading:'lazy',width:'55',height:'55'});
      image.addEventListener('error',()=>image.remove(),{once:true});
      card.append(image);
    }
    const info = make('div');
    info.append(make('strong',product.title));
    info.append(make('span',new Intl.NumberFormat('vi-VN').format(product.price)+'₫',{class:'sb-chat-price'}));
    const variant=[product.size&&'Size '+product.size,product.color].filter(Boolean).join(' · ');
    if (variant) info.append(make('small',variant));
    card.append(info);
    return card;
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || request) return;
    input.value = '';
    send.disabled = true;
    const pending = new AbortController();
    request = pending;
    log.append(make('p',message,{class:'sb-chat-user'}));
    const {row,bubble} = botMessage();
    bubble.append(make('p','Đang tìm sản phẩm…'));
    log.scrollTop = log.scrollHeight;
    try {
      const response = await fetch('/api/chat/recommendations',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message}),
        signal:AbortSignal.any([pending.signal,AbortSignal.timeout(12000)]),
      });
      const result = await response.json();
      if (request !== pending) return;
      if (!response.ok) throw Error(result.message || 'Chưa tìm được sản phẩm.');
      bubble.replaceChildren(make('p',result.reply));
      if (result.criteria.length) bubble.append(make('small',result.criteria.join(' · '),{class:'sb-chat-criteria'}));
      for (const product of result.products) bubble.append(productCard(product));
      helpMessage();
    } catch (error) {
      if (request !== pending) return;
      bubble.textContent = error.name==='TimeoutError' ? 'Tìm kiếm quá thời gian. Bạn gửi lại nhé.' : error.message || 'Không kết nối được cửa hàng.';
      helpMessage();
    } finally {
      if (request === pending) {
        request = null;
        send.disabled = false;
        if (!panel.hidden) log.scrollTop = Math.max(0,row.offsetTop-12);
      }
    }
  };
})();
