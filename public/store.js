(() => {
  const node = (tag, text, attrs = {}) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    for (const [key,value] of Object.entries(attrs)) element.setAttribute(key,value);
    return element;
  };
  const link = (label,href) => node('a',label,{href});
  const money = value => new Intl.NumberFormat('vi-VN').format(value/100) + '₫';
  const status = {pending:'Chờ xác nhận',confirmed:'Đã xác nhận',shipping:'Đang giao',completed:'Hoàn tất',cancelled:'Đã hủy'};
  const next = {pending:['confirmed','cancelled'],confirmed:['shipping','cancelled'],shipping:['completed'],completed:[],cancelled:[]};
  const root = document.querySelector('#store-screen');
  const feedback = node('p','',{role:'status'});
  async function api(url,data) {
    const response = await fetch(url,data===undefined?undefined:{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.message || 'Yêu cầu thất bại.');
    return result;
  }
  function run(work) {
    return Promise.resolve().then(work).catch(error=>{feedback.textContent=error.message;});
  }
  function button(title, work) {
    const control = node('button',title,{type:'button'});
    control.onclick = async () => {
      control.disabled=true;
      await run(work);
      control.disabled=false;
    };
    return control;
  }
  function field(title,name,value='',options={}) {
    const {tag='input',...attrs}=options;
    const label=node('label',title), input=node(tag,null,{name,...attrs});
    input.value=value;
    label.append(input);
    return label;
  }
  function form(target, fields, label, submit) {
    const element=node('form',null,{class:'panel'});
    const action=node('button',label,{type:'submit'});
    element.append(...fields,action);
    element.onsubmit=async event=>{
      event.preventDefault();
      action.disabled=true;
      feedback.textContent='';
      await run(()=>submit(Object.fromEntries(new FormData(element)),element));
      action.disabled=false;
    };
    target.append(element);
    return element;
  }
  function orderCard(order,admin,onChange) {
    const card=node('article',null,{class:'panel'});
    card.append(node('strong','#'+order.id.slice(0,8)+' · '+status[order.status]),
      node('p',new Date(order.created_at).toLocaleString('vi-VN')+' · COD · '+money(order.total)),
      node('p',order.recipient+' · '+order.phone+' · '+order.address));
    if (order.note) card.append(node('p',order.note));
    for (const item of order.items) card.append(node('p',item.title+' · '+item.variant+' × '+item.quantity+' · '+money(item.price*item.quantity)));
    if (admin) for (const value of next[order.status] || []) card.append(button(status[value],async()=>{
      await api('/api/admin/store/orders',{id:order.id,status:value});
      await onChange();
    }));
    return card;
  }
  async function paged(target,path,render,page=1) {
    const url=new URL(path,location.origin);
    url.searchParams.set('page',page);
    const data=await api(url);
    target.replaceChildren(...data.rows.map(render));
    if (!data.rows.length) target.append(node('p','Chưa có dữ liệu.'));
    if (page>1) target.append(button('Trang trước',()=>paged(target,path,render,page-1)));
    if (data.next) target.append(button('Trang sau',()=>paged(target,path,render,page+1)));
  }
  async function account(customer) {
    form(root,[field('Họ','last_name',customer.last_name,{required:'',maxlength:'100'}),
      field('Tên','first_name',customer.first_name,{required:'',maxlength:'100'})],'Lưu hồ sơ',async data=>{
      await api('/api/account/profile',data);
      feedback.textContent='Đã lưu hồ sơ.';
    });
    root.append(node('p',customer.email),button('Đăng xuất',async()=>{await api('/api/logout',{});location.assign('/');}));
    if (customer.role==='admin') root.append(link('Mở trang quản trị','/admin'));
    const history=node('section');
    root.append(node('h2','Đơn hàng của tôi'),history);
    await paged(history,'/api/orders',order=>orderCard(order,false));
  }
  function checkout(session) {
    if (!session.customer) {
      root.append(link('Đăng nhập để đặt hàng','/account/login?return_to=%2Fcheckout'),node('p','Giỏ hàng sẽ được giữ sau khi đăng nhập.'));
      return;
    }
    if (!session.cart.items.length) {
      root.append(node('p','Giỏ hàng đang trống.'),link('Xem sản phẩm','/collections/all'));
      return;
    }
    const subtotal=session.cart.total_price, shipping=subtotal>=99900000?0:3500000;
    const requestId=Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
    const summary=node('section',null,{class:'panel'});
    for (const item of session.cart.items) summary.append(node('p',item.title+' × '+item.quantity+' · '+money(item.line_price)));
    summary.append(node('p','Phí giao hàng '+money(shipping)),node('strong','Tổng thanh toán COD '+money(subtotal+shipping)));
    root.append(summary);
    form(root,[field('Người nhận','recipient',[session.customer.last_name,session.customer.first_name].join(' '),{required:'',maxlength:'100'}),
      field('Điện thoại','phone','',{type:'tel',required:'',minlength:'8',maxlength:'24'}),
      field('Địa chỉ','address','',{required:'',minlength:'8',maxlength:'300'}),
      field('Ghi chú','note','',{tag:'textarea',maxlength:'500'})],'Đặt đơn COD',async data=>{
      const order=await api('/api/orders',{...data,request_id:requestId,expected_subtotal:subtotal});
      root.replaceChildren(node('h2','Đã ghi nhận đơn hàng'),orderCard(order,false),link('Xem lịch sử đơn hàng','/account'));
    });
  }
  function productEditor(target, product, collections, onSave) {
    const variants=node('div');
    function addVariant(value={}) {
      const row=node('fieldset',null,{class:'variant'});
      row.dataset.id=value.id ?? '';
      row.dataset.stock=value.expected_stock ?? '';
      row.append(node('legend',value.id?'Biến thể #'+value.id:'Biến thể mới'));
      for (const [label,name] of [['SKU','sku'],['Size','size'],['Màu','color'],['Chất liệu','material']]) row.append(field(label,name,value[name]||'',{maxlength:'100'}));
      row.append(field('Giá VND','price',value.price??0,{type:'number',min:'0',step:'1',required:''}),
        field('Tồn kho','stock',value.stock??0,{type:'number',min:'0',step:'1',required:''}));
      const enabled=field('Đang bán','enabled','',{type:'checkbox'});
      enabled.querySelector('input').checked=value.enabled!==false;
      row.append(enabled);
      if (!value.id) row.append(button('Bỏ biến thể mới',()=>row.remove()));
      variants.append(row);
    }
    const p=product || {};
    const select=node('select',null,{name:'collections',multiple:'',size:'7'});
    for (const key of collections) {
      const option=node('option',key.split('/').at(-1),{value:key});
      option.selected=p.collections?.includes(key) || false;
      select.append(option);
    }
    const label=node('label','Danh mục (giữ Ctrl để chọn nhiều)');
    label.append(select);
    const active=field('Hiển thị sản phẩm','active','',{type:'checkbox'});
    active.querySelector('input').checked=p.active!==false;
    target.replaceChildren(node('h2',product?'Sửa sản phẩm':'Thêm sản phẩm'));
    form(target,[
      field('Đường dẫn (chữ thường, số và dấu gạch ngang)','handle',p.handle||'',{required:'',pattern:'[a-z0-9][a-z0-9\\-]{0,149}',...(product?{readonly:''}:{})}),
      field('Tên sản phẩm','title',p.title||'',{required:'',maxlength:'220'}),
      field('Thương hiệu','vendor',p.vendor||''),field('Loại sản phẩm','type',p.type||''),
      field('URL ảnh','image',p.image||''),field('Mô tả','description',p.description||'',{tag:'textarea',rows:'5'}),
      active,label,variants,button('Thêm biến thể',()=>addVariant()),
    ],'Lưu sản phẩm',async (data,element)=>{
      const rows=[...variants.children].map(row=>{
        const value=name=>row.querySelector('[name="'+name+'"]').value;
        return {
          ...(row.dataset.id?{id:Number(row.dataset.id),expected_stock:Number(row.dataset.stock)}:{}),
          sku:value('sku'),size:value('size'),color:value('color'),material:value('material'),
          price:Number(value('price')),stock:Number(value('stock')),enabled:row.querySelector('[name="enabled"]').checked,
        };
      });
      await api('/api/admin/store/products',{...data,create:!product,active:element.elements.active.checked,
        collections:[...select.selectedOptions].map(o=>o.value),variants:rows});
      feedback.textContent='Đã lưu sản phẩm.';
      await onSave(data.handle);
    });
    (p.variants || [{}]).forEach(addVariant);
  }
  async function admin() {
    const base='/api/admin/store';
    const info=await api(base+'/overview');
    const nav=node('div',null,{class:'actions'}), panel=node('section');
    root.append(node('p',`${info.products} sản phẩm đang hiển thị · ${info.variants} biến thể · ${info.members} thành viên · ${info.pending} đơn chờ`),nav,panel);
    async function products() {
      const list=node('section'), editor=node('section'), search=node('input',null,{type:'search',placeholder:'Tên hoặc đường dẫn','aria-label':'Tìm sản phẩm'});
      const edit=async handle=>productEditor(editor,await api(base+'/products?handle='+encodeURIComponent(handle)),info.collections,async saved=>{
        await load();
        await edit(saved);
      });
      const load=()=>paged(list,base+'/products?q='+encodeURIComponent(search.value),p=>{
        const row=node('article',null,{class:'panel compact'});
        row.append(node('span',p.title+(p.active?'':' · Đã ẩn')),button('Sửa',()=>edit(p.handle)));
        return row;
      });
      panel.replaceChildren(search,button('Tìm',load),button('Thêm sản phẩm',()=>productEditor(editor,null,info.collections,async saved=>{await load();await edit(saved);})),editor,list);
      search.onkeydown=event=>{if(event.key==='Enter')run(load);};
      await load();
    }
    async function orders() {
      const list=node('section');
      const filter=node('select',null,{'aria-label':'Lọc trạng thái'});
      filter.append(node('option','Mọi trạng thái',{value:''}),...Object.entries(status).map(([id,label])=>node('option',label,{value:id})));
      panel.replaceChildren(filter,list);
      const load=()=>paged(list,base+'/orders?status='+filter.value,o=>orderCard(o,true,load));
      filter.onchange=()=>run(load);
      await load();
    }
    async function members() {
      await paged(panel,base+'/members',member=>{
        const row=node('article',null,{class:'panel compact'});
        row.append(node('span',member.email+' · '+(member.role==='admin'?'Quản trị':member.disabled?'Đã khóa':'Thành viên')));
        if (member.role!=='admin') row.append(button(member.disabled?'Mở khóa':'Khóa',async()=>{
          await api(base+'/members',{id:member.id,disabled:!member.disabled});
          await members();
        }));
        return row;
      });
    }
    nav.append(button('Sản phẩm',products),button('Đơn hàng',orders),button('Thành viên',members),
      link('Kiểm duyệt đánh giá','/admin/reviews'));
    await products();
  }
  const purchase=document.querySelector('[data-purchase]');
  if (purchase) {
    purchase.onsubmit=event=>{
      event.preventDefault();
      const data=Object.fromEntries(new FormData(purchase));
      const submit=purchase.querySelector('button');
      submit.disabled=true;
      run(async()=>{
        await api('/cart/add.js',{id:Number(data.id),quantity:Number(data.quantity)});
        location.assign('/cart');
      }).finally(()=>submit.disabled=false);
    };
    purchase.parentElement.append(feedback);
  }
  if (root) {
    root.before(feedback);
    run(async()=>{
      if(root.dataset.page==='/admin') return admin();
      const session=await api('/api/session');
      if(root.dataset.page==='/checkout') return checkout(session);
      if(!session.customer) return location.assign('/account/login');
      return account(session.customer);
    });
  }
})();
