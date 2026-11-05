// Leituras reutilizadas apenas na memória desta sessão; nunca em armazenamento persistente.
class CacheLeiturasPortal {
    constructor() { this.entradas = new Map(); }
    limpar(modulos) {
        if (!Array.isArray(modulos)) {
            for (const entrada of this.entradas.values()) entrada.invalidada = true;
            this.entradas.clear();
            return;
        }
        for (const [chave, entrada] of this.entradas) {
            if (!entrada.modulo || modulos.includes(entrada.modulo)) {
                entrada.invalidada = true;
                this.entradas.delete(chave);
            }
        }
    }
    async obter(chave, carregar, ttl = 0, modulo = null) {
        for (const [k, e] of this.entradas) if (!e.pendente && e.ate <= Date.now()) this.entradas.delete(k);
        if (this.entradas.size > 100) for (const [k,e] of this.entradas) { if (!e.pendente) this.entradas.delete(k); }
        const atual = this.entradas.get(chave);
        if (atual && (atual.pendente || atual.ate > Date.now())) {
            const valor = await atual.valor;
            if (atual.invalidada && modulo) throw new Error('Leitura invalidada por uma atualização.');
            return structuredClone(valor);
        }
        const entrada = { pendente: true, ate: 0, modulo };
        entrada.valor = Promise.resolve().then(carregar);
        this.entradas.set(chave, entrada);
        try {
            const valor = await entrada.valor;
            if (entrada.invalidada && modulo) throw new Error('Leitura invalidada por uma atualização.');
            entrada.pendente = false;
            entrada.ate = Date.now() + ttl;
            if (!ttl) {
                if (this.entradas.get(chave) === entrada) this.entradas.delete(chave);
            }
            return structuredClone(valor);
        } catch (erro) {
            if (this.entradas.get(chave) === entrada) this.entradas.delete(chave);
            throw erro;
        }
    }
}
const cacheLeiturasPortal = new CacheLeiturasPortal();
function invalidarLeiturasPortal(modulos) {
    if (!Array.isArray(modulos)) {
        cacheLeiturasPortal.limpar();
        return;
    }
    const afetados = [...modulos];
    if (modulos.includes('cadastros')) afetados.push('cargas', 'configuracoes');
    if (afetados.includes('cargas') || modulos.includes('contestacoes')) afetados.push('premiacao');
    cacheLeiturasPortal.limpar(afetados);
}
window.addEventListener('bocchi:atualizacao', evento => invalidarLeiturasPortal(evento.detail));
window.addEventListener('bocchi:sessao-invalida', () => cacheLeiturasPortal.limpar());

