const normalize = value => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/\p{Mark}/gu, '').replace(/[đð]/g, 'd').replace(/\s+/g, ' ').trim();
const words = value => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const has = (value, phrase) => (' '+value+' ').includes(' '+phrase+' ');
const colors = {
  'Đen':['den','black'], 'Trắng':['trang','white','ivory','off white'],
  'Đỏ':['do','red','burgundy'], 'Xanh dương':['xanh duong','xanh da troi','blue','navy'],
  'Xanh lá':['xanh la','green','olive'], 'Xám':['xam','gray','grey'], 'Hồng':['hong','pink'],
  'Nâu':['nau','brown'], 'Be':['be','beige','cream','kem','tan'], 'Vàng':['vang','yellow'],
  'Cam':['cam','orange'], 'Tím':['tim','purple','violet'],
};
const categories = {
  'Giày':['giay','sneaker','sneakers'], 'Dép':['dep','sandal','slides','slipper'],
  'Balo':['balo','ba lo','backpack'], 'Túi':['tui','tote','duffel'],
  'Áo':['ao','shirt','hoodie'], 'Quần':['quan','pants','shorts'],
  'Vớ':['vo','tat','socks'], 'Nón':['non','mu','cap'], 'Bình giữ nhiệt':['binh giu nhiet','binh nuoc','tumbler'],
};
const ignore = new Set('toi minh em ban cho can muon co xem goi y tim mua mot vai mau san pham mon hang phu hop duoc khong nao voi va gia tam khoang duoi tren tu den gia tot hon mang mot doi mon chiec nhe ngan sach phan khuc toi da toi thieu chao hello hi size kich thuoc'.split(' '));
const usage = [
  [/\b(di hoc|di lam|di choi|hang ngay|di bo)\b/g,'đi hằng ngày'],
  [/\b(chay bo|tap luyen|the thao|gym)\b/g,'tập luyện'],
];
const amountPattern = '(?:\\d{1,3}(?:[. ,]\\d{3}){1,3}(?:\\s*(?:dong|vnd|d))?|\\d+(?:[.,]\\d+)?\\s*(?:trieu|nghin|ngan|vnd|dong|tr|k|d)|\\d{4,10})(?![a-z0-9])';
const rangeAmount = '(?:'+amountPattern+'|\\d+(?:[.,]\\d+)?)(?![a-z0-9.,])';

function amount(raw, fallback) {
  const cleaned = raw.replace(/\s+/g,'');
  const match = cleaned.match(/^(\d+)(?:trieu|tr)(\d{1,3})$/);
  if (match) return Number(match[1])*1e6 + Number(match[2].padEnd(3,'0'))*1000;
  const suffix = cleaned.match(/(trieu|tr|nghin|ngan|k|dong|vnd|d)$/)?.[0];
  const num = suffix ? cleaned.slice(0,-suffix.length) : cleaned;
  const multiplier = ['trieu','tr'].includes(suffix) ? 1e6 : ['nghin','ngan','k'].includes(suffix) ? 1000 : suffix || /^\d{4,}$/.test(num) || /^[\d]+(?:[.,]\d{3})+$/.test(num) ? 1 : fallback;
  const numeric = multiplier === 1 ? num.replace(/[.,]/g,'') : num.replace(',','.');
  return Math.round(Number(numeric)*multiplier);
}
function readBudget(input) {
  const pattern = '(?:'+amountPattern+'|\\d+(?:trieu|tr)\\d{1,3}(?![a-z0-9]))';
  const range = input.match(new RegExp('(?:\\btu\\s+)?('+rangeAmount+')\\s*(?:-|–|\\bden\\b)\\s*('+pattern+')','i'));
  if (range) {
    const scale = /(?:trieu|tr)$/.test(range[2].trim()) ? 1e6 : /(?:nghin|ngan|k)$/.test(range[2].trim()) ? 1000 : 1;
    return {min:amount(range[1],scale),max:amount(range[2],1), used:range[0]};
  }
  // Prioritize the compact form (e.g. 1tr2) before interpreting other numbers.
  const one = input.match(new RegExp('(?:\\b(duoi|toi da|khong qua|tren|tu|toi thieu|khoang|tam|ngan sach|gia)\\s+)?(\\d+(?:trieu|tr)\\d{1,3}(?![a-z0-9])|'+amountPattern+')'));
  if (!one) return {min:0,max:null,used:''};
  const value = amount(one[2],1);
  if (['tren','tu','toi thieu'].includes(one[1])) return {min:value,max:null,used:one[0]};
  return {min:0,max:value,used:one[0]};
}

function option(product, variant, key) {
  const label = key==='size' ? /^(kich thuoc|kich co|size)$/ : /^(mau|mau sac|colou?r)$/;
  const position = (product.options || []).findIndex(item => label.test(normalize(item?.name ?? item)));
  return position < 0 ? '' : String(variant.options?.[position] ?? variant['option'+(position+1)] ?? '');
}
function imageFor(product,variant) {
  const raw = variant.featured_image || product.featured_image || product.images?.[0];
  let value = typeof raw==='string' ? raw : raw?.src;
  if (value?.startsWith('//')) value = 'https:'+value;
  return /^(https:\/\/[^\s]+|\/assets\/[\w.-]+)$/.test(value || '') ? value : null;
}
const displayMoney = value => new Intl.NumberFormat('vi-VN').format(value)+'₫';

export function recommend(products, rawMessage) {
  const original = normalize(rawMessage);
  const budget = readBudget(original);
  const sizeMatch = original.match(/\b(?:size|kich co|kich thuoc)\s*[:=]?\s*(\d{1,2}(?:[.,]\d+)?|xxxl|xxl|xl|xs|s|m|l)\b/);
  let size = sizeMatch?.[1]?.replace(',','.');
  let term = original;
  for (const used of [budget.used,sizeMatch?.[0]]) if (used) term = term.replace(used,' ');
  if (!size && /\bgiay\b/.test(term)) {
    const implicitSize = term.match(/(?:^|\s)(3[4-9]|4\d)([.,]5)?(?=\s|[?!]|$)/);
    if (implicitSize) {
      size = (implicitSize[1]+(implicitSize[2] || '')).replace(',','.');
      term = term.replace(implicitSize[0],' ');
    }
  }
  const query = words(term);
  const brandAliases = new Map();
  for (const p of products) {
    if (!p.vendor) continue;
    const alias = words(p.vendor).replace(/^sneakerbuzz$/,'sneaker buzz');
    brandAliases.set(alias,p.vendor);
  }
  const brandMatch = [...brandAliases.keys()].sort((a,b)=>b.length-a.length)
    .find(alias=>has(query,alias)||alias==='sneaker buzz'&&has(query,'sneakerbuzz'));
  const withoutBrand = brandMatch ? query.replace(new RegExp('(?:^| )'+brandMatch+'(?= |$)'),' ').replace(/\bsneakerbuzz\b/g,' ') : query;
  const category = Object.entries(categories).find(([,aliases])=>aliases.some(alias=>has(withoutBrand,alias)));
  const selectedColors = Object.entries(colors).filter(([,aliases])=>aliases.some(alias=>has(withoutBrand,alias)));
  let remaining = withoutBrand;
  const use = [];
  for (const [pattern, label] of usage) {
    const stripped = remaining.replace(pattern,' ');
    if (stripped!==remaining) use.push(label);
    remaining = stripped;
  }
  const structuredWords = new Set([...(category?.[1] || []),...selectedColors.flatMap(([,aliases])=>aliases)].flatMap(v=>v.split(' ')));
  const keywords = [...new Set(remaining.split(' ').filter(word=>word.length>1&&!ignore.has(word)&&!structuredWords.has(word)))];
  const criterionLabels = [
    brandMatch && brandAliases.get(brandMatch),category?.[0],size&&'Size '+size.toUpperCase(),
    ...selectedColors.map(([label])=>label),budget.min>0&&'Từ '+displayMoney(budget.min),
    budget.max!==null&&'Tối đa '+displayMoney(budget.max),...use,
  ].filter(Boolean);
  if (budget.max!==null && budget.min>budget.max) return {reply:'Giá bắt đầu đang cao hơn giá kết thúc. Bạn nhập lại khoảng giá nhé.',products:[],criteria:[]};
  if (!criterionLabels.length && !keywords.length) return {reply:'Mình có thể tìm sản phẩm theo loại, thương hiệu, màu, size và ngân sách. Ví dụ “giày Vans đen size 42 dưới 2 triệu”.',products:[],criteria:[]};
  const found = [];
  for (const p of products) {
    if (brandMatch && words(p.vendor).replace(/^sneakerbuzz$/,'sneaker buzz') !== brandMatch) continue;
    const type = words(p.type);
    if (category && !(type+' ').startsWith(words(category[0])+' ')) continue;
    if (use.length&&!category&&!brandMatch&&!/^(giay|dep)( |$)/.test(type)) continue;
    const matching = p.variants.filter(v=>{
      if (!v.available || v.inventory_quantity<=0 || v.price/100<budget.min || (budget.max!==null&&v.price/100>budget.max)) return false;
      const variantSize = normalize(option(p,v,'size')).replace(',','.');
      if (size && variantSize !== size && !variantSize.split(/\s*[/–-]\s*/).includes(size)) return false;
      const variantColor = words(option(p,v,'color') || p.title);
      if (selectedColors.length && !selectedColors.every(([,aliases])=>aliases.some(alias=>has(variantColor,alias)))) return false;
      const haystack = words([p.title,p.vendor,p.type,v.sku,v.title].join(' '));
      return keywords.every(keyword=>has(haystack,keyword));
    });
    if (!matching.length) continue;
    const variant = matching.reduce((best,v)=>v.price<best.price?v:best);
    const variantSize = option(p,variant,'size'), variantColor = option(p,variant,'color');
    found.push({title:p.title,brand:p.vendor,price:variant.price/100,
      image:imageFor(p,variant), url:'/products/'+encodeURIComponent(p.handle),
      size:variantSize,color:variantColor,variantId:variant.id});
  }
  found.sort((a,b)=>a.price-b.price || a.title.localeCompare(b.title,'vi'));
  const reply = found.length
    ? 'Mình tìm được '+found.length+' sản phẩm còn hàng phù hợp. '+(found.length>5?'Đây là 5 lựa chọn có giá thấp nhất.':'Bạn có thể mở sản phẩm để xem chi tiết.')+(use.length?' Gợi ý theo danh mục và dữ liệu sản phẩm hiện có.':'')
    : 'Mình chưa tìm thấy sản phẩm còn hàng khớp các tiêu chí. Bạn thử nới ngân sách hoặc đổi màu, size nhé.';
  return {reply,products:found.slice(0,5),criteria:criterionLabels};
}
