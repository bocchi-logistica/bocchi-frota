// Leituras reutilizadas apenas na memória desta sessão; nunca em armazenamento persistente.
class CacheLeiturasPortal {
    constructor() { this.entradas = new Map(); this.geracao = 0; }
    limpar() { this.geracao++; this.entradas.clear(); }
    async obter(chave, carregar, ttl = 0) {
        for (const [k, e] of this.entradas) if (!e.pendente && e.ate <= Date.now()) this.entradas.delete(k);
        if (this.entradas.size > 100) for (const [k,e] of this.entradas) { if (!e.pendente) this.entradas.delete(k); }
        const atual = this.entradas.get(chave);
        if (atual && (atual.pendente || atual.ate > Date.now())) return structuredClone(await atual.valor);
        const geracao = this.geracao;
        const entrada = { pendente: true, ate: 0 };
        entrada.valor = Promise.resolve().then(carregar);
        this.entradas.set(chave, entrada);
        try {
            const valor = await entrada.valor;
            entrada.pendente = false;
            entrada.ate = Date.now() + ttl;
            if (!ttl || geracao !== this.geracao) {
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
window.addEventListener('bocchi:atualizacao', () => cacheLeiturasPortal.limpar());
window.addEventListener('bocchi:sessao-invalida', () => cacheLeiturasPortal.limpar());

