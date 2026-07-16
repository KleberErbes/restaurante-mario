# 🚀 Developer Cheatsheet — Restaurante do Mário

Guia rápido para modificar o código.

---

## 📍 Onde Fazer Alterações

| O Que | Onde | Exemplo |
|------|------|---------|
| Adicionar item ao cardápio | `state.cardapio.carnes.push('novo')` | Novo tipo de carne |
| Mudar preço marmita | `CONFIG` (linha 9-10) | Preço médio: `26 → 30` |
| Mudar horário funcionamento | `CONFIG.horario` (linha 7) | Abertura: `14:00 → 15:00` |
| Mudar número WhatsApp | `CONFIG.whatsappNumber` (linha 6) | `554733752227 → novo` |
| Mudar URL Google Sheets | `CONFIG.sheetsUrl` (linha 4) | Novo spreadsheet |
| Adicionar limite (acomp/carnes) | `CONFIG.limits` (linha 11) | `acompMax: 5 → 10` |
| Mudar cor tema | `style.css` linha 12+ | `--verde-900`, `--dourado` |
| Adicionar nova seção | `index.html` + novo manager | Nova funcionalidade |

---

## 🔧 Padrão para Adicionar Funcionalidade

### Exemplo: Adicionar Cupom de Desconto

```javascript
// 1. Adicionar ao CONFIG
const CONFIG = {
  // ...
  cupomDesconto: { max: 0.5, ativo: true }  // ← NOVO
};

// 2. Adicionar ao state
const state = {
  // ...
  cupomAplicado: null  // ← NOVO
};

// 3. Criar novo Manager
const CupomManager = {
  aplicar(codigo) {
    // Validar código
    // Atualizar state.cupomAplicado
    // Recalcular total
    CartManager.atualizarTotal();
  }
};

// 4. Expor para HTML
window.aplicarCupom = (codigo) => CupomManager.aplicar(codigo);
```

---

## 🐛 Debugar

```javascript
// Ver estado completo
console.log(state);

// Ver carrinho
console.log(state.cart);

// Ver seleções personalizadas
console.log(state.personalizadaSel);

// Verificar horário
console.log(Schedule.getEstado());
console.log(Schedule.isAberto());

// Simular adição ao carrinho
CartManager.adicionarPadrao('media');

// Verificar localStorage
console.log(JSON.parse(localStorage.getItem('rdm_cart')));

// Limpar localStorage (reset)
localStorage.clear();
```

---

## 📝 Estrutura Manager

Cada manager segue este padrão:

```javascript
const NomeManager = {
  // Variáveis privadas (opcionais)
  _cache: null,

  // Métodos públicos
  metodoPublico() {
    // Atualiza state
    state.propriedade = valor;
    // Chama renderização
    this.renderizar();
  },

  // Métodos internos (sem underscore = públicos mesmo assim)
  renderizar() {
    // Atualiza DOM
    document.getElementById('elemento').innerHTML = '...';
  }
};

// Chamar: NomeManager.metodoPublico();
```

---

## 🎨 Padrão de Renderização

```javascript
// Renderizar lista
const items = state.cardapio.carnes;
const container = document.getElementById('carneGrid');
container.innerHTML = '';  // Limpar

items.forEach(item => {
  const el = document.createElement('div');
  el.textContent = item;  // Usar textContent, não innerHTML!
  container.appendChild(el);
});
```

---

## ⚡ Performance Checklist

Antes de fazer algo, pergunte:

- [ ] Estou acessando `state` diretamente? (sim = ✅)
- [ ] Estou usando `dom.` cache ou fazendo `document.getElementById()`? (cache = ✅)
- [ ] Estou alterando DOM em loop? (não = ✅)
- [ ] Estou usando `textContent` ou `innerHTML`? (textContent = ✅)
- [ ] Estou adicionando event listeners múltiplas vezes? (não = ✅)

---

## 🔒 Segurança Checklist

Antes de fazer algo, verifique:

- [ ] Dados do usuário vão via `textContent`? (sim = ✅)
- [ ] Estou validando input antes de usar? (sim = ✅)
- [ ] localStorage tem validação de tipo? (sim = ✅)
- [ ] Tenho try-catch em fetch? (sim = ✅)
- [ ] Strings dinâmicas têm sanitização? (sim = ✅)

---

## 📱 Testes Rápidos

```bash
# 1. Performance
# → Abrir DevTools (F12) → Performance tab
# → Gravar 5 segundos de interação
# → Ver se TBT < 100ms

# 2. Acessibilidade
# → Navegar só com teclado (Tab, Enter, Escape)
# → Testar com NVDA (Windows) ou VoiceOver (Mac)
# → Usar Chrome DevTools → Lighthouse

# 3. Responsivo
# → DevTools → Toggle device toolbar
# → Testar em 320px, 640px, 1024px

# 4. Cross-browser
# → Chrome, Firefox, Safari, Edge
```

---

## 🚨 Erros Comuns

| Erro | Causa | Solução |
|------|-------|--------|
| "Cannot read 'cart'" | state não inicializado | Verificar `dom.init()` em DOMContentLoaded |
| Nada aparece no carrinho | DOM não atualizado | Chamar `UI.updateCartUI()` após mudar state |
| localStorage não funciona | Private mode / quota | Try-catch ao salvar |
| Event disparado 2x | Event listener adicionado 2x | Usar cache `dom.`, não querySelector repetido |
| Cardápio não carrega | Google Sheets URL errado | Verificar `CONFIG.sheetsUrl` |
| WhatsApp não abre | Número formatado errado | Deve ser formato E.164: `554733752227` |

---

## 🔍 Procurar Código

```javascript
// Encontrar onde 'cart' é usado
// Cmd+F em script.js: "state.cart"

// Encontrar todos os listeners
// Cmd+F em script.js: ".addEventListener"
// Cmd+F em index.html: "onclick="

// Encontrar seletores DOM
// Cmd+F em index.html: "id="
```

---

## 🎯 Operações Comuns

### Adicionar item ao state
```javascript
state.cart.push({ tipo: 'novo', preco: 50 });
UI.updateCartUI();
```

### Atualizar elemento DOM
```javascript
const el = dom.cartCount;  // Sempre usar cache
el.textContent = state.cart.length;
```

### Mostrar notificação
```javascript
UI.showToast('Operação concluída!', 'sucesso');
// tipos: 'info', 'aviso', 'sucesso'
```

### Validar e salvar localStorage
```javascript
try {
  localStorage.setItem('key', JSON.stringify(data));
} catch (e) {
  console.warn('localStorage indisponível:', e);
}
```

### Fazer fetch com erro handling
```javascript
try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // processar data
} catch (e) {
  console.error('Erro:', e);
  UI.showToast('Erro ao buscar dados', 'aviso');
}
```

---

## 🚀 Deploy Rápido

```bash
# 1. Verificar mudanças
git status

# 2. Ver diffs
git diff

# 3. Commitar
git add .
git commit -m "type: descrição"

# 4. Push
git push origin main

# 5. GitHub Pages faz deploy automaticamente
# (se repositório público + GitHub Pages ativado)
```

---

## 📞 Suporte Rápido

**Pergunta**: Como adicionar nova categoria de cardápio?
**Resposta**: 
1. Adicionar em Google Sheets: nova coluna com `categoria | item`
2. CardapioManager automaticamente carrega
3. Adicionar novo container em HTML (se quiser renderizar)

**Pergunta**: Como mudar logo?
**Resposta**: Substituir `logo.jpeg` por nova imagem com mesmo nome

**Pergunta**: Como adicionar modo dark?
**Resposta**: Adicionar em CSS: `@media (prefers-color-scheme: dark) { ... }`

**Pergunta**: Como integrar com banco de dados?
**Resposta**: Criar `DataManager` que substitua chamadas para Google Sheets

---

## 🎓 Próximas Melhorias

Por ordem de impacto:

1. **Testes (Jest)** — 20% tempo
2. **TypeScript** — 30% tempo
3. **Vite/Webpack** — 15% tempo
4. **React/Vue** — 50% tempo (só se crescer muito)
5. **Banco de dados** — 40% tempo

---

## 🔗 Referências Rápidas

- **MDN Web Docs**: Documentação oficial JavaScript/CSS/HTML
- **Google Sheets API**: Como usar spreadsheets como banco de dados
- **WhatsApp Business API**: Integração mais profissional
- **Lighthouse**: Performance e acessibilidade
- **WCAG 2.1**: Padrão de acessibilidade

---

Última atualização: 2026-07-16
