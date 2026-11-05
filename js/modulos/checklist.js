/* ================= MOTORISTA: CHECK LIST ================= */
function TelaChecklist({ st, setSt, user, toast, inicioAgendamento, onInicioConsumido, onConcluidoAgendamento }) {
    /* O envio passa pela fila local (IndexedDB) e pelo serviço de integração,
       com controle de idempotência por idLocal. O estado local atualiza a
       interface e sustenta o modo local de testes. */
    const meus = st.checklists.filter(c => c.motorista === user.nome).sort((a, b) => b.data.localeCompare(a.data));
    const normalizarTexto = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const deHoje = meus.find(c => c.data === HOJE && c.status !== 'reprovado');
    const reprovadoHoje = meus.find(c => c.data === HOJE && c.status === 'reprovado');
    const [preenchendo, setPreenchendo] = useState(false);
    const [resps, setResps] = useState({});
    const [ver, setVer] = useState(null);
    const abrirChecklistHistorico = async ck => {
        if(CONFIG.MODO_TESTE_LOCAL){setVer(ck);return;}
        try{
            const r=await ApiService.consultarChecklist(ck.protocolo||ck.id),d=r.checklist;
            if(!d)throw new Error("Checklist não encontrado.");
            setVer({...ck,respostas:(d.respostas||[]).map(rr=>({pid:rr.idPergunta,pergunta:rr.pergunta||"",resp:rr.resposta,obs:rr.observacao||"",foto:rr.linkFoto||rr.fotos?.[0]?.conteudoBase64||null}))});
        }catch(e){toast("Não foi possível carregar as fotos do checklist: "+e.message);}
    };
    const mesAtualFiltro = String(HOJE || '').slice(0, 7);
    const [filtroMesHistorico, setFiltroMesHistorico] = useState(mesAtualFiltro);
    const [filtroStatusHistorico, setFiltroStatusHistorico] = useState('todos');
    const [extras, setExtras] = useState({ km: '', combustivel: '' });
    const [enviando, setEnviando] = useState(false);
    const [ultimoEnvio, setUltimoEnvio] = useState(null); // confirmação real da API (protocolo)
    const [pendentes, setPendentes] = useState([]); // fila local aguardando envio
    const [online, setOnline] = useState(navigator.onLine);
    const [temRascunho, setTemRascunho] = useState(false);
    const fileRefs = useRef({});
    const veiculosDemo = Object.values(st.frota).filter(f => f.motorista === user.nome);
    const [veiculosPermitidos, setVeiculosPermitidos] = useState(CONFIG.MODO_TESTE_LOCAL ? veiculosDemo : []);
    const [carregandoVeiculos, setCarregandoVeiculos] = useState(!CONFIG.MODO_TESTE_LOCAL);
    const [erroVeiculos, setErroVeiculos] = useState('');
    const [veiculo, setVeiculo] = useState(veiculosDemo[0]?.placa || '');
    const vSel = veiculosPermitidos.find(v => v.placa === veiculo);
    const frotaSel = normalizarTexto(vSel?.tipoFrota || vSel?.frota || user.tipoFrotaAcesso || '').includes('leve') ? 'leve' : 'pesada';
    const [perguntasAtivas, setPerguntasAtivas] = useState([]);
    const perguntasPeriodicasRef = useRef([]);
    const [periodicidadeChecklist, setPeriodicidadeChecklist] = useState(null);
    const [modoChecklistAdicional, setModoChecklistAdicional] = useState(false);
    const [carregandoPerguntas, setCarregandoPerguntas] = useState(false);
    const [erroPerguntas, setErroPerguntas] = useState('');
    const [modoOcorrenciaAgendamento, setModoOcorrenciaAgendamento] = useState(false);
    const [grupoOcorrencia, setGrupoOcorrencia] = useState('');
    const [ultimoChecklistValido, setUltimoChecklistValido] = useState(null);
    const mapearPerguntas = (lista, tipo) => (lista || []).map(p => ({
        id: String(p.id),
        texto: p.texto || '',
        grupo: p.grupo || 'Outros',
        frota: (p.tipoFrota || tipo).toLowerCase(),
        frequencia: p.frequencia || 'Diária',
        obrigatoria: p.obrigatoria === true,
        fotoNC: p.fotoObrigatoriaNC === true,
        observacaoObrigatoriaNC: p.observacaoObrigatoriaNC === true,
        ativa: p.ativa !== false,
        ordem: Number(p.ordem || 999)
    })).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.ordem - b.ordem);
    useEffect(() => {
        if (CONFIG.MODO_TESTE_LOCAL)
            return;
        let ativo = true;
        setCarregandoVeiculos(true);
        setErroVeiculos('');
        ApiService.obterVeiculos().then(r => {
            if (!ativo)
                return;
            const recebidos = r.veiculos || [];
            if (inicioAgendamento?.placa) {
                const placaAlvo = String(inicioAgendamento.placa || '').trim().toUpperCase();
                const cadastrado = recebidos.find(v => String(v.placa || '').trim().toUpperCase() === placaAlvo);
                const unico = cadastrado || { placa: placaAlvo, tipoFrota: 'FROTA LEVE', frota: 'FROTA LEVE', tipoModelo: 'CARRO', tipo: 'CARRO', usoCompartilhado: true, ativo: true };
                setVeiculosPermitidos([unico]);
                setVeiculo(unico.placa);
            }
            else {
                // No checklist aberto manualmente, veículos compartilhados de agendamento não podem ser escolhidos.
                // Permanecem somente veículos efetivamente vinculados ao usuário (ex.: Frota Pesada).
                const vinculados = recebidos.filter(v => v.usoCompartilhado !== true);
                setVeiculosPermitidos(vinculados);
                setVeiculo(atual => vinculados.some(v => v.placa === atual) ? atual : (vinculados[0]?.placa || ''));
            }
        }).catch(e => { if (ativo) {
            setVeiculosPermitidos([]);
            setVeiculo('');
            setErroVeiculos(e.message || 'Não foi possível carregar os veículos.');
        } })
            .finally(() => { if (ativo)
            setCarregandoVeiculos(false); });
        return () => { ativo = false; };
    }, [user.id, user.login, inicioAgendamento?.placa]);
    const normalizarStatusChecklist = valor => {
        const s = String(valor || 'pendente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (s.includes('aprov'))
            return 'aprovado';
        if (s.includes('reprov'))
            return 'reprovado';
        return 'pendente';
    };
    const carregarHistorico = async (silencioso = false) => {
        if (CONFIG.MODO_TESTE_LOCAL)
            return;
        try {
            const r = await ApiService.consultarMeusChecklists();
            const vindos = (r.checklists || []).map(x => ({
                id: x.protocolo || x.id,
                idLocal: x.idLocal || '',
                motorista: x.motoristaNome || user.nome,
                placa: x.placa || '',
                frota: String(x.tipoChecklist || '').toUpperCase().includes('LEVE') ? 'leve' : 'pesada',
                data: String(x.dataHoraLocal || '').slice(0, 10),
                status: normalizarStatusChecklist(x.status),
                motivoReprova: x.motivoReprova || '',
                km: String(x.quilometragem || ''),
                respostas: (x.respostas || []).map(rr => ({
                    pid: String(rr.idPergunta || ''),
                    pergunta: rr.pergunta || '',
                    resp: rr.resposta || 'NA',
                    obs: rr.observacao || '',
                    foto: rr.linkFoto || null
                }))
            }));
            setSt(s => ({ ...s, checklists: vindos }));
        }
        catch (e) {
            if (!silencioso) toast('O checklist foi salvo, mas não foi possível atualizar o histórico: ' + (e.message || e));
        }
    };
    useEffect(() => { carregarHistorico(); }, []);
    useAtualizacaoPortal(['checklists'], () => carregarHistorico(true));
    useEffect(() => {
        let ativo = true;
        const carregar = async () => {
            if (carregandoVeiculos || !veiculo) { setErroPerguntas(''); setPerguntasAtivas([]); return; }
            setCarregandoPerguntas(true);
            setErroPerguntas('');
            setPerguntasAtivas([]);
            try {
                const tipo = frotaSel === 'leve' ? 'LEVE' : 'PESADA';
                const r = await ApiService.obterPerguntas(tipo, { placa: veiculo, ignorarFrequencia: !!inicioAgendamento?.agendamentoId });
                if (!ativo)
                    return;
                const lista = mapearPerguntas(r.perguntas, tipo);
                setPerguntasAtivas(lista);
                perguntasPeriodicasRef.current = lista;
                setPeriodicidadeChecklist(r.periodicidade || null);
                setModoChecklistAdicional(false);
            }
            catch (e) {
                if (ativo)
                    setErroPerguntas(e.message || 'Não foi possível carregar as perguntas.');
            }
            finally {
                if (ativo)
                    setCarregandoPerguntas(false);
            }
        };
        carregar();
        return () => { ativo = false; };
    }, [frotaSel, veiculo, carregandoVeiculos]);
    useEffect(() => {
        if (!inicioAgendamento?.placa || carregandoVeiculos)
            return;
        const placaAlvo = String(inicioAgendamento.placa).toUpperCase();
        const encontrado = veiculosPermitidos.find(v => String(v.placa || '').toUpperCase() === placaAlvo);
        if (encontrado && veiculo !== encontrado.placa)
            setVeiculo(encontrado.placa);
    }, [inicioAgendamento, carregandoVeiculos, veiculosPermitidos, veiculo]);
    useEffect(() => {
        if (!inicioAgendamento?.placa || preenchendo || carregandoVeiculos || carregandoPerguntas || erroVeiculos || erroPerguntas)
            return;
        if (String(veiculo || '').toUpperCase() !== String(inicioAgendamento.placa).toUpperCase())
            return;
        if (!perguntasAtivas.length)
            return;
        let ativo = true;
        const preparar = async () => {
            try {
                let modo = String(inicioAgendamento.modoChecklist || '').toUpperCase();
                let ultimo = inicioAgendamento.ultimoChecklist || null;
                if (!modo) {
                    const contexto = await ApiService.contextoChecklistAgendamento(veiculo);
                    modo = contexto?.modoChecklist || 'COMPLETO';
                    ultimo = contexto?.ultimoChecklist || null;
                }
                if (!ativo)
                    return;
                setExtras(x => ({ ...x, km: String(inicioAgendamento.km || x.km || '') }));
                setResps({});
                setGrupoOcorrencia('');
                setUltimoChecklistValido(ultimo);
                setModoOcorrenciaAgendamento(modo === 'OCORRENCIA');
                setPreenchendo(true);
                setUltimoEnvio(null);
            }
            catch (e) {
                if (ativo)
                    toast('Não foi possível preparar o checklist do agendamento: ' + (e.message || e));
            }
            finally { }
        };
        preparar();
        return () => { ativo = false; };
    }, [inicioAgendamento, veiculo, perguntasAtivas, carregandoVeiculos, carregandoPerguntas, erroVeiculos, erroPerguntas, preenchendo]);
    const formatarFrequenciasChecklist = lista => {
        const nomes = (lista || []).map(valor => ({ 'Diária': 'diário', 'Semanal': 'semanal', 'Mensal': 'mensal' }[valor] || String(valor || '').toLowerCase())).filter(Boolean);
        if (nomes.length <= 1)
            return nomes[0] || 'periódico';
        return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
    };
    const periodoPesadoConcluido = frotaSel === 'pesada' && periodicidadeChecklist?.aplicada === true && periodicidadeChecklist?.todasRealizadas === true;
    const frequenciasRealizadasLabel = formatarFrequenciasChecklist(periodicidadeChecklist?.frequenciasRealizadas);
    const frequenciasPendentesLabel = formatarFrequenciasChecklist(periodicidadeChecklist?.frequenciasPendentes);
    const grupos = [...new Set(perguntasAtivas.map(p => p.grupo))];
    const perguntasExibidas = modoOcorrenciaAgendamento ? (grupoOcorrencia ? perguntasAtivas.filter(p => p.grupo === grupoOcorrencia) : []) : perguntasAtivas;
    const chaveRascunho = 'ck_' + user.login + '_' + HOJE;
    // Histórico e indicadores respeitam o mês/status escolhidos pelo motorista.
    const historicoFiltrado = meus.filter(c => (!filtroMesHistorico || String(c.data || '').slice(0, 7) === filtroMesHistorico) && (filtroStatusHistorico === 'todos' || c.status === filtroStatusHistorico));
    const cont = lista => ({ tot: lista.length, ap: lista.filter(c => c.status === 'aprovado').length, rep: lista.filter(c => c.status === 'reprovado').length, pen: lista.filter(c => c.status === 'pendente').length });
    const cM = cont(historicoFiltrado);
    const mesFiltroLabel = filtroMesHistorico ? mesLabel(filtroMesHistorico.slice(5, 7) + '/' + filtroMesHistorico.slice(0, 4)) : 'todos os meses';
    /* Monitora a fila local e o estado da conexão. */
    const atualizarFila = () => { FilaEnvio.pendentes(user.login).then(setPendentes).catch(() => { }); };
    useEffect(() => {
        atualizarFila();
        const ouv = () => atualizarFila();
        FilaEnvio.ouvintes.add(ouv);
        const on = () => { setOnline(true); FilaEnvio.processar(toast, user.login); };
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        // Remove automaticamente apenas registros locais impossíveis de recuperar.
        // Checklists válidos aguardando internet continuam preservados.
        FilaEnvio.sanear(user.login).then(() => atualizarFila()).catch(() => { });
        IDB.lerRascunho(chaveRascunho).then(r => setTemRascunho(!!r));
        return () => { FilaEnvio.ouvintes.delete(ouv); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, [user.login]);
    /* Salva o rascunho automaticamente e avisa antes de sair da página. */
    useEffect(() => {
        if (!preenchendo)
            return;
        const t = setTimeout(() => { IDB.salvarRascunho(chaveRascunho, { resps, extras, veiculo }).catch(() => { }); }, 800);
        return () => clearTimeout(t);
    }, [resps, extras, veiculo, preenchendo]);
    useEffect(() => {
        if (!preenchendo)
            return;
        const aviso = e => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', aviso);
        return () => window.removeEventListener('beforeunload', aviso);
    }, [preenchendo]);
    const abrirFormulario = async () => {
        if (carregandoVeiculos) {
            toast('Aguarde: carregando o veículo vinculado.');
            return;
        }
        if (erroVeiculos) {
            toast('Não foi possível abrir o checklist: ' + erroVeiculos);
            return;
        }
        if (!veiculo) {
            toast('Nenhum veículo ativo está compartilhado ou vinculado ao seu usuário.');
            return;
        }
        if (carregandoPerguntas) {
            toast('Aguarde: carregando as perguntas do banco D1 de homologação.');
            return;
        }
        if (erroPerguntas) {
            toast('Não foi possível abrir o checklist: ' + erroPerguntas);
            return;
        }
        if (!perguntasAtivas.length) {
            toast('Não há inspeções pendentes para este veículo neste período.');
            return;
        }
        const r = await IDB.lerRascunho(chaveRascunho).catch(() => null);
        if (r && (Object.keys(r.resps || {}).length || r.extras && r.extras.km)) {
            setResps(r.resps || {});
            setExtras(r.extras || { km: '', combustivel: '' });
            if (r.veiculo)
                setVeiculo(r.veiculo);
            toast('Rascunho recuperado — continue de onde parou.');
        }
        setPreenchendo(true);
        setUltimoEnvio(null);
    };
    const abrirFormularioAdicional = async () => {
        if (frotaSel !== 'pesada' || !periodoPesadoConcluido)
            return;
        if (carregandoVeiculos || carregandoPerguntas) {
            toast('Aguarde: carregando os dados do checklist.');
            return;
        }
        if (erroVeiculos || !veiculo) {
            toast('Não foi possível abrir o checklist adicional: ' + (erroVeiculos || 'veículo não identificado.'));
            return;
        }
        setCarregandoPerguntas(true);
        try {
            const r = await ApiService.obterPerguntas('PESADA', { placa: veiculo, ignorarFrequencia: true });
            const lista = mapearPerguntas(r.perguntas, 'PESADA');
            if (!lista.length) {
                toast('Não há perguntas ativas de Frota Pesada para este veículo.');
                return;
            }
            setPerguntasAtivas(lista);
            setModoChecklistAdicional(true);
            setResps({});
            setExtras({ km: '', combustivel: '' });
            setPreenchendo(true);
            setUltimoEnvio(null);
        }
        catch (e) {
            toast('Não foi possível abrir o checklist adicional: ' + (e.message || e));
        }
        finally {
            setCarregandoPerguntas(false);
        }
    };
    const cancelar = () => {
        setPreenchendo(false);
        setResps({});
        setExtras({ km: '', combustivel: '' });
        setModoOcorrenciaAgendamento(false);
        setGrupoOcorrencia('');
        setUltimoChecklistValido(null);
        setModoChecklistAdicional(false);
        setPerguntasAtivas(perguntasPeriodicasRef.current);
        IDB.apagarRascunho(chaveRascunho).catch(() => { });
        setTemRascunho(false);
        if (inicioAgendamento?.agendamentoId && onInicioConsumido)
            onInicioConsumido();
    };
    const setResp = (pid, campo, v) => setResps(r => ({ ...r, [pid]: { ...(r[pid] || {}), [campo]: v } }));
    /* Comprime a foto (máx. 1600px, JPEG q=0,7) antes de anexar. */
    const anexar = (pid, e) => {
        const f = e.target.files && e.target.files[0];
        if (!f)
            return;
        e.target.value = '';
        comprimirImagem(f)
            .then(b64 => setResp(pid, 'foto', b64))
            .catch(err => toast(err.message));
    };
    const removerFoto = (pid) => setResp(pid, 'foto', null);
    const obterLocalizacao = () => new Promise(res => {
        if (!navigator.geolocation)
            return res({ latitude: null, longitude: null });
        navigator.geolocation.getCurrentPosition(p => res({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => res({ latitude: null, longitude: null }), { timeout: 4000, maximumAge: 600000 });
    });
    /* Valida os dados, padroniza o payload e envia pela fila local. */
    const enviar = async () => {
        if (enviando)
            return; // prevenção contra clique duplo
        if (!String(user?.nome || '').trim() || !String(user?.login || '').trim()) {
            toast('Sua sessão está incompleta. Saia, entre novamente e refaça o checklist.');
            return;
        }
        if (!String(veiculo || '').trim()) {
            toast('Selecione um veículo antes de enviar.');
            return;
        }
        // Quilometragem obrigatória e válida para qualquer frota
        const km = parseInt(extras.km || localStorage.getItem('km_' + veiculo) || '0', 10);
        if ((!modoOcorrenciaAgendamento && !extras.km) || isNaN(km) || km <= 0) {
            toast('Informe a quilometragem atual do veículo (somente números).');
            return;
        }
        if (km > 3000000) {
            toast('Quilometragem fora do limite razoável. Confira o valor.');
            return;
        }
        const ultimoKm = parseInt(localStorage.getItem('km_' + veiculo) || '0', 10);
        if (ultimoKm && km < ultimoKm && !window.confirm('Atenção: a quilometragem informada (' + km + ') é MENOR que a última registrada para esta placa (' + ultimoKm + '). Deseja continuar mesmo assim?'))
            return;
        for (const p of perguntasExibidas) {
            const r = resps[p.id];
            // No checklist periódico completo, mantém a obrigatoriedade normal.
            // No modo NC do agendamento, o motorista responde somente o(s) item(ns) com problema.
            if (!modoOcorrenciaAgendamento && p.obrigatoria && (!r || !r.resp)) {
                toast('Responda: "' + p.texto.slice(0, 40) + '..."');
                return;
            }
            if (r && r.resp === 'NC' && !r.obs) {
                toast('Descreva o problema do item não conforme: ' + p.texto.slice(0, 35) + '...');
                return;
            }
            if (r && r.resp === 'NC' && p.fotoNC && !r.foto) {
                toast('Anexe a foto da não conformidade: ' + p.texto.slice(0, 35) + '...');
                return;
            }
        }
        if (modoOcorrenciaAgendamento) {
            if (!grupoOcorrencia) {
                toast('Selecione o grupo onde foi identificada a não conformidade.');
                return;
            }
            const respostasNC = perguntasExibidas.filter(p => resps[p.id]?.resp === 'NC');
            if (!respostasNC.length) {
                toast('Marque ao menos uma pergunta como Não conforme no grupo selecionado.');
                return;
            }
        }
        if (!window.confirm('Confirma o envio do ' + (modoChecklistAdicional ? 'checklist adicional' : 'checklist') + ' da placa ' + veiculo + '?'))
            return;
        setEnviando(true);
        try {
            const loc = await obterLocalizacao();
            const idLocal = gerarUUID(); // mesmo id em todas as tentativas -> sem duplicidade no banco D1 de homologação
            const registro = {
                idLocal,
                dataHoraLocal: agoraISO(),
                motorista: { nome: user.nome, login: user.login },
                veiculo: { placa: veiculo, tipo: vSel ? vSel.tipo : '' },
                quilometragem: km,
                combustivel: frotaSel === 'leve' ? (extras.combustivel || '') : '',
                tipoChecklist: modoOcorrenciaAgendamento ? 'LEVE_NC_AGENDAMENTO' : (frotaSel === 'leve' ? 'LEVE' : 'PESADA'),
                versaoFormulario: CONFIG.VERSAO,
                localizacao: loc,
                respostas: (modoOcorrenciaAgendamento ? perguntasExibidas.filter(p => resps[p.id]?.resp) : perguntasExibidas).map(p => {
                    const r = resps[p.id] || {};
                    return { idPergunta: p.id, grupo: p.grupo, pergunta: p.texto,
                        resposta: r.resp || 'NA', observacao: r.obs || '', possuiFoto: !!r.foto,
                        fotos: r.foto ? [{ nome: p.id + '-01.jpg', tipo: 'image/jpeg', conteudoBase64: r.foto }] : [] };
                }),
                quantidadeNC: perguntasExibidas.filter(p => resps[p.id] && resps[p.id].resp === 'NC').length,
                statusChecklist: 'PENDENTE',
                agendamentoId: inicioAgendamento?.agendamentoId || '',
                etapaAgendamento: inicioAgendamento?.etapa || '',
                origemChecklist: inicioAgendamento?.agendamentoId ? (modoOcorrenciaAgendamento ? 'AGENDAMENTO_NC' : 'AGENDAMENTO_RETIRADA') : (modoChecklistAdicional ? 'CHECKLIST_ADICIONAL' : 'CHECKLIST_NORMAL'),
                regularizacaoTerceiro: inicioAgendamento?.regularizacaoTerceiro === true
            };
            // 1) grava na fila local ANTES de tentar enviar (não se perde sem internet)
            await FilaEnvio.adicionar(registro);
            localStorage.setItem('km_' + veiculo, String(km));
            // Somente no modo local de testes o registro entra diretamente no painel local.
            // Em produção, o painel administrativo deve carregar exclusivamente os dados da API/banco D1 de homologação.
            if (CONFIG.MODO_TESTE_LOCAL) {
                const registroLocal = { id: 'demo' + Date.now(), idLocal, motorista: user.nome, placa: veiculo, frota: frotaSel, data: HOJE, status: 'pendente', motivoReprova: '',
                    km: String(km), combustivel: extras.combustivel || '',
                    respostas: perguntasExibidas.map(p => ({ pid: p.id, resp: (resps[p.id] && resps[p.id].resp) || 'NA', obs: (resps[p.id] && resps[p.id].obs) || '', foto: (resps[p.id] && resps[p.id].foto) || null })) };
                setSt(s => ({ ...s, checklists: [...s.checklists, registroLocal] }));
            }
            // 2) tenta enviar agora; só marca ENVIADO com confirmação real da API
            await FilaEnvio.processar(toast, user.login);
            const fila = await IDB.listarFila();
            const meu = fila.find(x => x.idLocal === idLocal);
            if (meu && meu.statusEnvio === 'ENVIADO') {
                setUltimoEnvio({ protocolo: meu.protocolo, placa: veiculo, quando: meu.dataHoraRecebimento || agoraISO() });
                await carregarHistorico();
                if (frotaSel === 'pesada' && !inicioAgendamento?.agendamentoId) {
                    try {
                        const periodoAtualizado = await ApiService.obterPerguntas('PESADA', { placa: veiculo });
                        const listaAtualizada = mapearPerguntas(periodoAtualizado.perguntas, 'PESADA');
                        perguntasPeriodicasRef.current = listaAtualizada;
                        setPeriodicidadeChecklist(periodoAtualizado.periodicidade || null);
                    }
                    catch (_e) {
                        // O envio já foi confirmado; a tela será atualizada na próxima abertura.
                    }
                }
                if (inicioAgendamento?.agendamentoId && onConcluidoAgendamento) {
                    setTimeout(() => onConcluidoAgendamento(), 350);
                }
            }
            else if (!navigator.onLine) {
                toast('Sem conexão com a internet. O checklist foi salvo neste aparelho e será enviado quando a conexão retornar.');
            }
            else {
                toast('Não foi possível concluir o envio agora. Seus dados continuam salvos neste aparelho.');
            }
            await IDB.apagarRascunho(chaveRascunho);
            setTemRascunho(false);
            setPreenchendo(false);
            setResps({});
            setExtras({ km: '', combustivel: '' });
            setModoOcorrenciaAgendamento(false);
            setGrupoOcorrencia('');
            setUltimoChecklistValido(null);
            setModoChecklistAdicional(false);
            setPerguntasAtivas(perguntasPeriodicasRef.current);
            atualizarFila();
        }
        finally {
            setEnviando(false);
        }
    };
    const reenviarPendentes = () => { toast('Tentando enviar novamente...'); FilaEnvio.processar(toast, user.login); };
    const excluirRegistroInvalido = async (idLocal) => {
        if (!window.confirm('Excluir este envio incompleto deste aparelho? Depois será necessário refazer o checklist.'))
            return;
        await IDB.removerFila(idLocal);
        atualizarFila();
        toast('Registro incompleto removido. Refaça o checklist.');
    };
    const rotuloStatusEnvio = { RASCUNHO: 'Rascunho', PENDENTE: 'Aguardando envio', ENVIANDO: 'Enviando...', ENVIADO: 'Enviado', ERRO: 'Falha no envio', DADOS_INCOMPLETOS: 'Precisa ser refeito' };
    return (React.createElement(React.Fragment, null,
        !online &&
            React.createElement("div", { className: "erro-box" }, "Sem conex\u00E3o com a internet. Voc\u00EA pode preencher normalmente \u2014 o checklist ficar\u00E1 salvo neste aparelho e ser\u00E1 enviado quando a conex\u00E3o retornar."),
        pendentes.length > 0 &&
            React.createElement("div", { className: "card", style: { borderLeft: '4px solid var(--colheita)' } },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("b", null,
                            pendentes.length,
                            " checklist(s) aguardando envio"),
                        React.createElement("div", { className: "muted" }, pendentes.map(p => dataBR(String(p.dataHoraLocal || '').slice(0, 10)) + ' · ' + (p.veiculo?.placa || 'placa não informada') + ' · ' + (rotuloStatusEnvio[p.statusEnvio] || p.statusEnvio) + (p.ultimoErro ? ' (' + p.ultimoErro + ')' : '')).join(' — '))),
                    pendentes.some(p => p.statusEnvio === 'DADOS_INCOMPLETOS')
                        ? React.createElement("button", { className: "btn btn-d btn-sm", onClick: () => excluirRegistroInvalido(pendentes.find(p => p.statusEnvio === 'DADOS_INCOMPLETOS').idLocal) }, "Excluir e refazer")
                        : React.createElement("button", { className: "btn btn-s btn-sm", onClick: reenviarPendentes }, "Tentar enviar novamente"))),
        ultimoEnvio &&
            React.createElement("div", { className: "card", style: { borderLeft: '4px solid var(--ok)' } },
                React.createElement("b", null, "Checklist enviado com sucesso."),
                React.createElement("div", { className: "muted", style: { marginTop: 4 } },
                    "Protocolo: ",
                    React.createElement("b", { className: "num" }, ultimoEnvio.protocolo),
                    React.createElement("br", null),
                    "Placa: ",
                    React.createElement("b", null, ultimoEnvio.placa),
                    " \u00B7 Data: ",
                    dataBR(ultimoEnvio.quando.slice(0, 10)),
                    " \u00E0s ",
                    ultimoEnvio.quando.slice(11, 16))),
        !preenchendo && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "totais" },
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num" }, cM.tot),
                    React.createElement("div", { className: "l" },
                        "Checklists em ",
                        mesFiltroLabel)),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: 'var(--mata)' } }, cM.ap),
                    React.createElement("div", { className: "l" }, "Aprovados")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: cM.rep ? 'var(--erro)' : 'var(--mata)' } }, cM.rep),
                    React.createElement("div", { className: "l" }, "Reprovados"))),
            cM.pen > 0 && React.createElement("div", { className: "muted", style: { textAlign: 'center', marginTop: -4 } },
                cM.pen,
                " checklist(s) aguardando an\u00E1lise nos filtros selecionados.")),
        !preenchendo && carregandoPerguntas &&
            React.createElement("div", { className: "aviso-box" }, "Carregando perguntas ativas do banco D1 de homologação..."),
        !preenchendo && erroPerguntas &&
            React.createElement("div", { className: "erro-box" },
                "Falha ao carregar as perguntas: ",
                erroPerguntas),
        !preenchendo && !carregandoVeiculos && veiculosPermitidos.length > 0 && !carregandoPerguntas && !erroPerguntas && perguntasAtivas.length === 0 && !periodoPesadoConcluido &&
            React.createElement("div", { className: "aviso-box" }, "Não há perguntas ativas disponíveis para a frota deste veículo. Confira o cadastro de perguntas antes de considerar o checklist dispensado."),
        !preenchendo && carregandoVeiculos && React.createElement("div", { className: "aviso-box" }, "Carregando ve\u00EDculo vinculado..."),
        !preenchendo && erroVeiculos && React.createElement("div", { className: "erro-box" },
            "Falha ao carregar ve\u00EDculos: ",
            erroVeiculos),
        !preenchendo && !carregandoVeiculos && !erroVeiculos && veiculosPermitidos.length === 0 && !inicioAgendamento?.placa && React.createElement("div", { className: "card muted", style: { textAlign: 'center', padding: '24px 16px' } }, (normalizarTexto(user.tipoFrotaAcesso).includes("leve") ? "Para veículo compartilhado, inicie o checklist pela retirada em Agendamento." : "Nenhum veículo vinculado e disponível para este usuário. A Logística deve conferir o vínculo, a vigência e o status do veículo em Cadastros → Vínculos.")),
        !preenchendo && veiculosPermitidos.length > 0 && periodoPesadoConcluido &&
            React.createElement("div", { className: "card", style: { textAlign: 'center', padding: '26px 16px', borderLeft: '4px solid var(--ok)' } },
                React.createElement("div", { style: { fontSize: 34 } }, "\u2705"),
                React.createElement("h3", { style: { margin: '6px 0 2px' } },
                    (periodicidadeChecklist?.frequenciasRealizadas || []).length > 1 ? 'Checklists ' + frequenciasRealizadasLabel + ' já realizados' : 'Checklist ' + frequenciasRealizadasLabel + ' já realizado'),
                React.createElement("div", { className: "muted", style: { marginBottom: 14 } }, "Todas as perguntas previstas para este veículo neste período já foram respondidas. Deseja fazer um checklist adicional?"),
                React.createElement("button", { className: "btn btn-p", disabled: carregandoVeiculos || carregandoPerguntas || !!erroVeiculos || !veiculo, onClick: abrirFormularioAdicional }, "Fazer checklist adicional")),
        !preenchendo && veiculosPermitidos.length > 0 && ((frotaSel === 'pesada' && perguntasAtivas.length > 0) || (frotaSel !== 'pesada' && !deHoje)) &&
            React.createElement("div", { className: "card", style: { textAlign: 'center', padding: '26px 16px' } },
                React.createElement("div", { style: { fontSize: 34 } }, "\uD83D\uDCCB"),
                React.createElement("h3", { style: { margin: '6px 0 2px' } }, reprovadoHoje ? 'Check list reprovado — refazer' : (frotaSel === 'pesada' ? 'Checklist ' + frequenciasPendentesLabel + ' pendente' : 'Check list de hoje pendente')),
                reprovadoHoje && React.createElement("div", { className: "erro-box", style: { margin: '8px 0' } },
                    "Motivo: ",
                    reprovadoHoje.motivoReprova),
                React.createElement("div", { className: "muted", style: { marginBottom: 14 } },
                    frotaSel === 'pesada' ? 'Há perguntas previstas para o período atual — ' : 'Inspeção pendente — ',
                    dataBR(HOJE)),
                React.createElement("button", { className: "btn btn-p", disabled: carregandoVeiculos || !!erroVeiculos || !veiculo, onClick: abrirFormulario }, reprovadoHoje ? 'Refazer check list' : (temRascunho ? 'Continuar rascunho' : 'Preencher agora'))),
        veiculosPermitidos.length > 0 && frotaSel !== 'pesada' && deHoje &&
            React.createElement("div", { className: "card row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, "Check list de hoje enviado"),
                    React.createElement("div", { className: "muted" },
                        dataBR(HOJE),
                        " \u00B7 ",
                        deHoje.placa)),
                React.createElement(StatusTag, { s: deHoje.status })),
        preenchendo && React.createElement(React.Fragment, null,
            modoChecklistAdicional && React.createElement("div", { className: "aviso-box" },
                React.createElement("b", null, "Checklist adicional de Frota Pesada."),
                " Este preenchimento é opcional e será identificado separadamente no envio."),
            modoOcorrenciaAgendamento && React.createElement("div", { className: "card", style: { borderLeft: '4px solid var(--colheita)' } },
                React.createElement("h3", null, "Registrar n\u00E3o conformidade do agendamento"),
                React.createElement("div", { className: "muted", style: { margin: '4px 0 10px' } }, "Selecione o grupo e registre os itens com problema, a descrição e as evidências exigidas."),
                ultimoChecklistValido && React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => abrirChecklistHistorico(ultimoChecklistValido) }, "Visualizar \u00FAltimo checklist realizado"),
                React.createElement("div", { style: { marginTop: 12 } },
                    React.createElement("label", { htmlFor: "tela-checklist-grupo-com-problema" }, "Grupo com problema"),
                    React.createElement("select", { id: "tela-checklist-grupo-com-problema", name: "tela-checklist-grupo-com-problema", value: grupoOcorrencia, onChange: e => { setGrupoOcorrencia(e.target.value); setResps({}); } },
                        React.createElement("option", { value: "" }, "Selecionar..."),
                        grupos.map(g => React.createElement("option", { key: g, value: g }, g))))),
            React.createElement("div", { className: "card" },
                React.createElement("label", null, "Ve\u00EDculo"),
                inicioAgendamento?.placa ? React.createElement(React.Fragment, null,
                    React.createElement("input", { value: veiculo, readOnly: true }),
                    React.createElement("div", { className: "muted", style: { marginTop: 6 } }, "Placa definida automaticamente pelo agendamento.")) : React.createElement("select", { value: veiculo, onChange: e => { setVeiculo(e.target.value); setResps({}); } }, veiculosPermitidos.map(f => React.createElement("option", { key: f.placa, value: f.placa },
                    f.placa,
                    " \u2014 ",
                    f.tipoModelo || f.tipo,
                    " (",
                    normalizarTexto(f.tipoFrota || f.frota).includes('leve') ? 'frota leve' : 'frota pesada',
                    ")"))),
                React.createElement("div", { className: "form-grid", style: { marginTop: 12 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-checklist-km-atual" }, "KM atual *"),
                        React.createElement("input", { id: "tela-checklist-km-atual", name: "tela-checklist-km-atual", autoComplete: "off", type: "number", inputMode: "numeric", value: extras.km, onChange: e => setExtras({ ...extras, km: e.target.value }), placeholder: "Ex.: 158420" })),
                    frotaSel === 'leve' && !modoOcorrenciaAgendamento &&
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-checklist-nivel-de-combustivel" }, "N\u00EDvel de combust\u00EDvel"),
                            React.createElement("select", { id: "tela-checklist-nivel-de-combustivel", name: "tela-checklist-nivel-de-combustivel", value: extras.combustivel, onChange: e => setExtras({ ...extras, combustivel: e.target.value }) },
                                React.createElement("option", { value: "" }, "Selecionar..."),
                                React.createElement("option", null, "Reserva"),
                                React.createElement("option", null, "1/4"),
                                React.createElement("option", null, "Meio tanque"),
                                React.createElement("option", null, "3/4"),
                                React.createElement("option", null, "Tanque cheio"))))),
            React.createElement("div", { className: "aviso-box" },
                "Marque cada item. Em ",
                React.createElement("b", null, "n\u00E3o conforme (NC)"),
                ", descreva o problema e anexe foto quando o item pedir. Seu preenchimento \u00E9 salvo automaticamente neste aparelho."),
            (modoOcorrenciaAgendamento ? (grupoOcorrencia ? [grupoOcorrencia] : []) : grupos).map(g => React.createElement(React.Fragment, { key: g },
                React.createElement("h3", { style: { margin: '6px 2px 0' } }, g),
                perguntasExibidas.filter(p => p.grupo === g).map(p => {
                    const r = resps[p.id] || {};
                    return (React.createElement("div", { className: "card perg", key: p.id },
                        React.createElement("div", { className: "txt" },
                            p.texto,
                            " ",
                            !modoOcorrenciaAgendamento && p.obrigatoria && React.createElement("span", { style: { color: 'var(--erro)' } }, "*")),
                        React.createElement("div", { className: "resp-btns" },
                            React.createElement("button", { className: 'resp-btn c' + (r.resp === 'C' ? ' on' : ''), onClick: () => setResp(p.id, 'resp', 'C') }, "Conforme"),
                            React.createElement("button", { className: 'resp-btn nc' + (r.resp === 'NC' ? ' on' : ''), onClick: () => setResp(p.id, 'resp', 'NC') }, "N\u00E3o conforme"),
                            React.createElement("button", { className: 'resp-btn na' + (r.resp === 'NA' ? ' on' : ''), onClick: () => setResp(p.id, 'resp', 'NA') }, "N/A")),
                        r.resp === 'NC' && React.createElement("div", { style: { marginTop: 10 } },
                            React.createElement("textarea", { rows: "2", placeholder: "Descreva o problema...", value: r.obs || '', onChange: e => setResp(p.id, 'obs', e.target.value) }),
                            React.createElement("div", { className: "row", style: { marginTop: 8 } },
                                r.foto && React.createElement(React.Fragment, null,
                                    React.createElement("img", { className: "foto-thumb", src: r.foto, alt: "Foto da n\u00E3o conformidade" }),
                                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => removerFoto(p.id), "aria-label": "Remover foto" }, "\u2715 Remover")),
                                React.createElement("button", { className: "foto-add", onClick: () => fileRefs.current[p.id] && fileRefs.current[p.id].click(), "aria-label": "Anexar foto" }, "\uD83D\uDCF7"),
                                React.createElement("input", { type: "file", accept: "image/*", capture: "environment", style: { display: 'none' }, ref: el => fileRefs.current[p.id] = el, onChange: e => anexar(p.id, e) }),
                                React.createElement("span", { className: "muted" }, p.fotoNC ? 'Foto obrigatória' : 'Foto opcional')))));
                }))),
            enviando && React.createElement("div", { className: "aviso-box" },
                React.createElement("b", null, "Enviando checklist..."),
                " N\u00E3o feche esta p\u00E1gina."),
            React.createElement("div", { className: "row" },
                React.createElement("button", { className: "btn btn-g grow", disabled: enviando, onClick: cancelar }, "Cancelar"),
                React.createElement("button", { className: "btn btn-p grow", disabled: enviando, style: enviando ? { opacity: .6 } : {}, onClick: enviar }, enviando ? 'Enviando...' : 'Enviar check list'))),
        !preenchendo && meus.length > 0 && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row", style: { marginTop: 4, flexWrap: 'wrap' } },
                React.createElement("h3", { className: "grow", style: { margin: 0 } }, "Hist\u00F3rico"),
                React.createElement("input", { type: "month", "aria-label": "Filtrar hist\u00F3rico por m\u00EAs", style: { width: 'auto' }, value: filtroMesHistorico, onChange: e => setFiltroMesHistorico(e.target.value) }),
                React.createElement("select", { "aria-label": "Filtrar hist\u00F3rico por status", style: { width: 'auto' }, value: filtroStatusHistorico, onChange: e => setFiltroStatusHistorico(e.target.value) },
                    React.createElement("option", { value: "todos" }, "Todos os status"),
                    React.createElement("option", { value: "pendente" }, "Aguardando an\u00E1lise"),
                    React.createElement("option", { value: "aprovado" }, "Aprovados"),
                    React.createElement("option", { value: "reprovado" }, "Reprovados")),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { setFiltroMesHistorico(mesAtualFiltro); setFiltroStatusHistorico('todos'); } }, "Limpar filtros")),
            historicoFiltrado.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum checklist encontrado nos filtros selecionados."),
            historicoFiltrado.map(c => React.createElement("div", { className: "card row", key: c.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, dataBR(c.data)),
                    React.createElement("div", { className: "muted" },
                        c.placa,
                        " \u00B7 ",
                        c.respostas.filter(r => r.resp === 'NC').length,
                        " NC")),
                React.createElement(StatusTag, { s: c.status }),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => abrirChecklistHistorico(c) }, "Ver")))),
        ver && React.createElement(ChecklistDetalhe, { ck: ver, perguntas: perguntasAtivas, permitirImpressao: false, onClose: () => setVer(null) })));
}
function ChecklistDetalhe({ ck, perguntas, onClose, acoes, permitirImpressao = true }) {
    const [fotoAberta, setFotoAberta] = useState(null);
    const escHtml = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const escAttr = escHtml;
    const imprimir = () => {
        const statusTexto = ck.status === 'aprovado' ? 'Aprovado' : ck.status === 'reprovado' ? 'Reprovado' : 'Aguardando análise';
        const linhas = ck.respostas.map(r => {
            const p = perguntas.find(x => x.id === r.pid);
            const textoPergunta = p?.texto || r.pergunta || 'Pergunta sem descrição';
            const resposta = r.resp === 'C' ? 'Conforme' : r.resp === 'NC' ? 'Não conforme' : 'N/A';
            return `<section class="item"><div class="item-top"><strong>${escHtml(textoPergunta)}</strong><span class="resp ${r.resp}">${resposta}</span></div>${r.obs ? `<div class="obs"><b>Observação:</b> ${escHtml(r.obs)}</div>` : ''}${r.foto ? `<img src="${escAttr(r.foto)}" alt="Foto da não conformidade">` : ''}</section>`;
        }).join('');
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) {
            alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.');
            return;
        }
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Checklist ${escHtml(ck.placa || '')}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#20231f;margin:0;font-size:11px}.cab{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #234b3b;padding-bottom:10px;margin-bottom:12px}.marca{color:#234b3b;font-size:18px;font-weight:700}.titulo{font-size:20px;margin:0 0 4px}.status{display:inline-block;border:1px solid #bbb;border-radius:5px;padding:4px 8px;font-weight:bold}.dados{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border:1px solid #d8dcd8;border-radius:7px;padding:10px;margin-bottom:12px}.dados div span{display:block;color:#68716b;font-size:9px;text-transform:uppercase;margin-bottom:2px}.item{border:1px solid #d8dcd8;border-radius:6px;padding:9px;margin-bottom:7px;break-inside:avoid;page-break-inside:avoid}.item-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.resp{white-space:nowrap;border-radius:10px;padding:3px 7px;font-size:9px;font-weight:bold}.resp.C{background:#dff1e7;color:#215a40}.resp.NC{background:#fde5dc;color:#9b3b20}.resp.NA{background:#eee;color:#555}.obs{margin-top:6px;color:#4d554f}.item img{display:block;width:auto;height:auto;max-width:min(65mm,100%);max-height:45mm;object-fit:contain;margin-top:6px;border:1px solid #ddd;border-radius:5px}.motivo{border:1px solid #e7a08c;background:#fff4ef;padding:9px;border-radius:6px;margin-bottom:12px}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-top:24px;break-inside:avoid}.linha{border-top:1px solid #333;padding-top:5px;color:#555}.rodape{border-top:1px solid #ddd;margin-top:18px;padding-top:6px;color:#777;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><header class="cab"><div><h1 class="titulo">Registro de Checklist</h1><div>Inspeção veicular</div></div><div class="marca">Bocchi Agrobios</div></header><div class="dados"><div><span>Motorista</span><b>${escHtml(ck.motorista || '—')}</b></div><div><span>Placa</span><b>${escHtml(ck.placa || '—')}</b></div><div><span>Data</span><b>${dataBR(ck.data)}</b></div><div><span>Tipo de frota</span><b>${ck.frota === 'leve' ? 'Frota leve' : 'Frota pesada'}</b></div><div><span>Status</span><b>${statusTexto}</b></div><div><span>Protocolo</span><b>${escHtml(ck.id || '—')}</b></div>${ck.frota === 'leve' ? `<div><span>Quilometragem</span><b>${escHtml(ck.km || '—')}</b></div>` : ''}</div>${ck.status === 'reprovado' && ck.motivoReprova ? `<div class="motivo"><b>Motivo da reprovação:</b> ${escHtml(ck.motivoReprova)}</div>` : ''}${linhas}<div class="assinaturas"><div class="linha">Motorista — nome/data</div><div class="linha">Responsável pela análise — nome/data</div></div><footer class="rodape">Documento gerado pelo Sistema de Gestão de Frota · ${new Date().toLocaleString('pt-BR')}</footer><script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
        w.document.close();
    };
    return (React.createElement(Modal, { titulo: 'Check list — ' + dataBR(ck.data), onClose: onClose },
        permitirImpressao && React.createElement("div", { className: "row", style: { justifyContent: 'flex-end', marginBottom: 10 } },
            React.createElement("button", { className: "btn btn-s btn-sm", onClick: imprimir }, "\uD83D\uDDA8 Imprimir")),
        React.createElement("div", { className: "muted", style: { marginBottom: 10 } },
            primeiroNome(ck.motorista),
            " \u00B7 ",
            ck.placa,
            " \u00B7 ",
            ck.frota === 'leve' ? 'Frota leve' : 'Frota pesada',
            " \u00B7 ",
            React.createElement(StatusTag, { s: ck.status })),
        ck.frota === 'leve' && (ck.km || ck.combustivel) &&
            React.createElement("div", { className: "muted", style: { marginBottom: 10 } },
                "KM: ",
                React.createElement("b", { className: "num" }, ck.km || '—'),
                " \u00B7 Combust\u00EDvel: ",
                React.createElement("b", null, ck.combustivel || '—')),
        ck.status === 'reprovado' && ck.motivoReprova && React.createElement("div", { className: "erro-box", style: { marginBottom: 10 } },
            "Motivo da reprova\u00E7\u00E3o: ",
            ck.motivoReprova),
        ck.respostas.map(r => {
            const p = perguntas.find(x => x.id === r.pid);
            const textoPergunta = p?.texto || r.pergunta || 'Pergunta sem descrição';
            return (React.createElement("div", { key: r.pid, style: { padding: '8px 0', borderBottom: '1px solid var(--linha)' } },
                React.createElement("div", { className: "row" },
                    React.createElement("span", { className: "grow", style: { fontSize: 13.5 } }, textoPergunta),
                    React.createElement("span", { className: 'tag ' + (r.resp === 'C' ? 'tag-ok' : r.resp === 'NC' ? 'tag-neg' : 'tag-neutro') }, r.resp === 'C' ? 'Conforme' : r.resp === 'NC' ? 'NC' : 'N/A')),
                r.obs && React.createElement("div", { className: "muted", style: { marginTop: 4 } }, r.obs),
                r.foto && React.createElement("img", { className: "foto-thumb foto-clicavel", style: { marginTop: 6, width: 110, height: 110 }, src: r.foto, alt: "Foto anexada \u2014 clique para ampliar", title: "Clique para ampliar", onClick: () => setFotoAberta(r.foto) })));
        }),
        acoes && React.createElement("div", { style: { marginTop: 14 } }, acoes),
        fotoAberta && React.createElement("div", { className: "visualizador-foto", onClick: e => { if (e.target === e.currentTarget)
                setFotoAberta(null); } },
            React.createElement("img", { src: fotoAberta, alt: "Foto ampliada do checklist" }),
            React.createElement("div", { className: "visualizador-foto-acoes" },
                React.createElement("a", { className: "btn btn-p", href: fotoAberta, download: 'checklist-' + (ck.placa || 'foto') + '.jpg', target: "_blank", rel: "noopener" }, "\u2B07 Baixar foto"),
                React.createElement("a", { className: "btn btn-s", href: fotoAberta, target: "_blank", rel: "noopener" }, "Abrir original"),
                React.createElement("button", { className: "btn btn-g", onClick: () => setFotoAberta(null) }, "Fechar")))));
}

/* ================= ADM: CHECK LIST (aprovação + perguntas + relatório) ================= */
function AdmChecklist({ st, setSt, toast, user, foco }) {
    /* Em produção, o painel carrega os registros pelo endpoint
       GET /admin/checklists. */
    const [sub, setSub] = useState(pode(user, 'checklist.aprovacao') ? 'aprovar' : pode(user, 'checklist.perguntas') ? 'perguntas' : 'relatorio');
    const [sincronizando, setSincronizando] = useState(false);
    const sincronizar = async () => {
        if (CONFIG.MODO_TESTE_LOCAL) {
            toast('Modo local de testes: dados simulados. Configure a URL do backend e desative MODO_TESTE_LOCAL para consultar o banco D1 de homologação.');
            return;
        }
        setSincronizando(true);
        try {
            const r = await ApiService.admListarChecklists();
            const vindos = (r.itens || r.checklists || []).map(x => ({
                id: x.protocolo, idLocal: x.idLocal, motorista: x.motoristaNome, placa: x.placa,
                frota: (x.tipoChecklist === 'LEVE' ? 'leve' : 'pesada'), data: (x.dataHoraLocal || '').slice(0, 10),
                status: (x.status || 'PENDENTE').toLowerCase() === 'aprovado' ? 'aprovado' : ((x.status || '').toLowerCase() === 'reprovado' ? 'reprovado' : 'pendente'),
                motivoReprova: x.motivoReprovacao || '', km: x.quilometragem, combustivel: '',
                respostas: (x.respostas || []).map(rr => ({ pid: rr.idPergunta, pergunta: rr.pergunta || '', resp: rr.resposta, obs: rr.observacao || '', foto: rr.linkFoto || (rr.fotos?.length ? true : null) }))
            }));
            setSt(s => ({ ...s, checklists: vindos.length ? vindos : s.checklists }));
            toast('Sincronizado: ' + vindos.length + ' checklist(s) carregado(s) do servidor.');
        }
        catch (e) {
            toast('Falha ao sincronizar: ' + e.message);
        }
        finally {
            setSincronizando(false);
        }
    };
    const [ver, setVer] = useState(null);
    const abrirDetalhe = async ck => {
        if(CONFIG.MODO_TESTE_LOCAL){setVer(ck);return;}
        try{
            const r=await ApiService.admDetalhe(ck.id), detalhe=r.checklist;
            if(!detalhe)throw new Error("Checklist não encontrado.");
            setVer({...ck,respostas:(detalhe.respostas||[]).map(rr=>({pid:rr.idPergunta,pergunta:rr.pergunta||"",resp:rr.resposta,obs:rr.observacao||"",foto:rr.linkFoto||rr.fotos?.[0]?.conteudoBase64||null}))});
        }catch(e){toast("Não foi possível carregar os anexos do checklist: "+e.message);}
    };
    const [reprovando, setReprovando] = useState(null);
    const [motivoRep, setMotivoRep] = useState('');
    const [bloquearAoAprovar, setBloquearAoAprovar] = useState(false);
    const [motivoBloqueio, setMotivoBloqueio] = useState('');
    const [veiculosBloqueados, setVeiculosBloqueados] = useState([]);
    const [carregandoBloqueados, setCarregandoBloqueados] = useState(false);
    const [liberandoVeiculo, setLiberandoVeiculo] = useState(null);
    const [observacaoLiberacao, setObservacaoLiberacao] = useState('');
    const perguntaVazia = { texto: '', grupo: 'Anomalias estéticas', frota: 'pesada', frequencia: 'Diária', ordem: 10, obrigatoria: true, fotoNC: false, ativa: true };
    const [novaPerg, setNovaPerg] = useState(perguntaVazia);
    const [editandoPergunta, setEditandoPergunta] = useState(null);
    const [fFrota, setFFrota] = useState('pesada');
    const [fMot, setFMot] = useState('todos');
    const mesAtualFiltro = String(HOJE || '').slice(0, 7);
    const [fMes, setFMes] = useState(mesAtualFiltro);
    const [fPlaca, setFPlaca] = useState('todas');
    const [fStatus, setFStatus] = useState('todos');
    const [fMesAprovacao, setFMesAprovacao] = useState('');
    const [carregandoCatalogo, setCarregandoCatalogo] = useState(false);
    useEffect(() => {
        if (!foco?.chave || !pode(user, 'checklist.aprovacao'))
            return;
        setSub('aprovar');
        setFMesAprovacao(foco.parametros?.competencia || '');
    }, [foco?.chave]);
    const carregarCatalogo = async () => {
        setCarregandoCatalogo(true);
        try {
            const r = await ApiService.obterPerguntas('TODAS', { incluirInativas: true });
            const lista = (r.perguntas || []).map(p => ({
                id: String(p.id),
                texto: p.texto || '',
                grupo: p.grupo || 'Outros',
                frota: (p.tipoFrota || '').toLowerCase(),
                frequencia: p.frequencia || 'Diária',
                obrigatoria: p.obrigatoria === true,
                fotoNC: p.fotoObrigatoriaNC === true,
                observacaoObrigatoriaNC: p.observacaoObrigatoriaNC === true,
                ativa: p.ativa !== false,
                ordem: Number(p.ordem || 999)
            })).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.ordem - b.ordem);
            setSt(s => ({ ...s, perguntas: lista }));
        }
        catch (e) {
            toast('Erro ao carregar perguntas do banco D1 de homologação: ' + e.message);
        }
        finally {
            setCarregandoCatalogo(false);
        }
    };
    const carregarBloqueados = async () => {
        setCarregandoBloqueados(true);
        try {
            const r = await ApiService.admVeiculosBloqueados();
            setVeiculosBloqueados(r.veiculos || []);
        }
        catch (e) {
            toast('Erro ao carregar veículos bloqueados: ' + e.message);
        }
        finally {
            setCarregandoBloqueados(false);
        }
    };
    useEffect(() => { carregarCatalogo(); sincronizar(); carregarBloqueados(); }, []);
    const pendentesTodos = st.checklists.filter(c => c.status === 'pendente');
    const pendentes = pendentesTodos.filter(c => !fMesAprovacao || String(c.data || '').slice(0, 7) === fMesAprovacao);
    const decidir = async (ck, status, motivo, opcoes = {}) => {
        if (status === 'aprovado' && opcoes.bloquearVeiculo === true && !String(opcoes.motivoBloqueio || '').trim()) {
            toast('Informe o motivo do bloqueio do veículo.');
            return;
        }
        if (!CONFIG.MODO_TESTE_LOCAL && ck.id && !String(ck.id).startsWith('DEMO-')) {
            try {
                await ApiService.admStatus(ck.id, status === 'aprovado' ? 'APROVADO' : 'REPROVADO', motivo || '', opcoes);
            }
            catch (e) {
                toast('Não foi possível gravar a decisão no banco D1 de homologação: ' + e.message);
                return;
            }
        }
        setSt(s => ({ ...s, checklists: s.checklists.map(x => x.id === ck.id ? { ...x, status, motivoReprova: motivo || '' } : x) }));
        setVer(null);
        setReprovando(null);
        setMotivoRep('');
        setBloquearAoAprovar(false);
        setMotivoBloqueio('');
        if (opcoes.bloquearVeiculo === true)
            await carregarBloqueados();
        toast(status === 'aprovado' ? (opcoes.bloquearVeiculo ? 'Check list aprovado e veículo bloqueado.' : 'Check list aprovado.') : 'Check list reprovado — o motorista deverá refazer.');
    };
    const liberarVeiculo = async () => {
        if (!liberandoVeiculo)
            return;
        try {
            await ApiService.admLiberarVeiculo(liberandoVeiculo.itemId, observacaoLiberacao);
            toast('Veículo liberado com sucesso.');
            setLiberandoVeiculo(null);
            setObservacaoLiberacao('');
            await carregarBloqueados();
        }
        catch (e) {
            toast('Erro ao liberar veículo: ' + e.message);
        }
    };
    const salvarPergunta = async () => {
        if (!novaPerg.texto.trim()) {
            toast('Escreva o texto da pergunta.');
            return;
        }
        const ordem = Number(novaPerg.ordem);
        if (!Number.isFinite(ordem) || ordem < 0) {
            toast('Informe uma ordem numérica igual ou maior que zero.');
            return;
        }
        try {
            const dados = {
                texto: novaPerg.texto.trim(),
                grupo: novaPerg.grupo,
                tipoFrota: novaPerg.frota.toUpperCase(),
                frequencia: novaPerg.frequencia,
                ordem,
                obrigatoria: novaPerg.obrigatoria,
                fotoObrigatoriaNC: novaPerg.fotoNC,
                observacaoObrigatoriaNC: true,
                ativa: novaPerg.ativa !== false
            };
            if (editandoPergunta)
                await ApiService.atualizarPergunta(editandoPergunta.id, dados);
            else
                await ApiService.criarPergunta(dados);
            await carregarCatalogo();
            setNovaPerg({ ...perguntaVazia, grupo: novaPerg.grupo, frota: novaPerg.frota, frequencia: novaPerg.frequencia, ordem: ordem + 10 });
            setEditandoPergunta(null);
            toast(editandoPergunta ? 'Pergunta atualizada no banco D1 de homologação.' : 'Pergunta salva no banco D1 de homologação.');
        }
        catch (e) {
            toast('Erro ao salvar pergunta: ' + e.message);
        }
    };
    const iniciarEdicao = p => { setEditandoPergunta(p); setNovaPerg({ texto: p.texto, grupo: p.grupo, frota: p.frota, frequencia: p.frequencia, ordem: p.ordem, obrigatoria: p.obrigatoria, fotoNC: p.fotoNC, ativa: p.ativa }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const alternarPergunta = async (p) => { try {
        await ApiService.atualizarPergunta(p.id, { texto: p.texto, grupo: p.grupo, tipoFrota: p.frota.toUpperCase(), frequencia: p.frequencia, ordem: p.ordem, obrigatoria: p.obrigatoria, fotoObrigatoriaNC: p.fotoNC, observacaoObrigatoriaNC: p.observacaoObrigatoriaNC, ativa: !p.ativa });
        await carregarCatalogo();
        toast(p.ativa ? 'Pergunta inativada.' : 'Pergunta reativada.');
    }
    catch (e) {
        toast('Erro ao alterar pergunta: ' + e.message);
    } };
    const motoristas = [...new Set(st.checklists.map(c => c.motorista).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const placas = [...new Set(st.checklists.map(c => c.placa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const relatorio = st.checklists.filter(c => (!fMes || String(c.data || '').slice(0, 7) === fMes) && (fPlaca === 'todas' || c.placa === fPlaca) && (fMot === 'todos' || c.motorista === fMot) && (fStatus === 'todos' || c.status === fStatus)).sort((a, b) => b.data.localeCompare(a.data));
    const totaisRelatorio = { total: relatorio.length, aprovados: relatorio.filter(c => c.status === 'aprovado').length, reprovados: relatorio.filter(c => c.status === 'reprovado').length, pendentes: relatorio.filter(c => c.status === 'pendente').length };
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("h2", { className: "grow" }, "Check list veicular"),
            React.createElement("button", { className: "btn btn-s btn-sm", disabled: sincronizando, onClick: sincronizar }, sincronizando ? 'Sincronizando...' : 'Sincronizar com servidor'),
            React.createElement("div", { className: "subtabs" },
                pode(user, 'checklist.aprovacao') && React.createElement("button", { className: 'subtab' + (sub === 'aprovar' ? ' on' : ''), onClick: () => setSub('aprovar') },
                    "Aprovar (",
                    pendentes.length,
                    ")"),
                pode(user, 'checklist.aprovacao') && React.createElement("button", { className: 'subtab' + (sub === 'bloqueados' ? ' on' : ''), onClick: () => { setSub('bloqueados'); carregarBloqueados(); } },
                    "Ve\u00EDculos bloqueados (",
                    veiculosBloqueados.length,
                    ")"),
                pode(user, 'checklist.perguntas') && React.createElement("button", { className: 'subtab' + (sub === 'perguntas' ? ' on' : ''), onClick: () => setSub('perguntas') }, "Perguntas"),
                pode(user, 'checklist.relatorio') && React.createElement("button", { className: 'subtab' + (sub === 'relatorio' ? ' on' : ''), onClick: () => setSub('relatorio') }, "Relat\u00F3rio"))),
        sub === 'aprovar' && pode(user, 'checklist.aprovacao') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card", style: { padding: 12 } },
                React.createElement("div", { className: "row", style: { flexWrap: 'wrap', alignItems: 'end' } },
                    React.createElement("label", { style: { minWidth: 190 } },
                        "Compet\u00EAncia",
                        React.createElement("input", { type: "month", value: fMesAprovacao, onChange: e => setFMesAprovacao(e.target.value) })),
                    fMesAprovacao && React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setFMesAprovacao('') }, "Todos os meses"),
                    React.createElement("div", { className: "muted grow" },
                        pendentes.length,
                        " checklist(s) aguardando decis\u00E3o no per\u00EDodo selecionado."))),
            pendentes.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum check list aguardando aprova\u00E7\u00E3o no per\u00EDodo selecionado."),
            pendentes.map(ck => React.createElement("div", { className: "card row", key: ck.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, primeiroNome(ck.motorista)),
                    React.createElement("div", { className: "muted" },
                        dataBR(ck.data),
                        " \u00B7 ",
                        ck.placa,
                        " \u00B7 ",
                        ck.respostas.filter(r => r.resp === 'NC').length,
                        " n\u00E3o conformidade(s)")),
                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => abrirDetalhe(ck) }, "Analisar")))),
        sub === 'bloqueados' && pode(user, 'checklist.aprovacao') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("h3", null, "Ve\u00EDculos bloqueados temporariamente"),
                        React.createElement("div", { className: "muted" }, "Bloqueios definidos ap\u00F3s an\u00E1lise de checklist, sinistro ou decis\u00E3o operacional.")),
                    React.createElement("button", { className: "btn btn-s btn-sm", onClick: carregarBloqueados }, carregandoBloqueados ? 'Atualizando...' : 'Atualizar'))),
            !carregandoBloqueados && veiculosBloqueados.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum ve\u00EDculo bloqueado no momento."),
            veiculosBloqueados.map(v => React.createElement("div", { className: "card row", key: v.itemId },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, v.placa),
                    React.createElement("div", { className: "muted" },
                        v.motivo || 'Motivo não informado',
                        v.bloqueadoEm ? ' · ' + fmtDataHora(v.bloqueadoEm) : '')),
                React.createElement("button", { className: "btn btn-p btn-sm", onClick: () => { setLiberandoVeiculo(v); setObservacaoLiberacao(''); } }, "Liberar ve\u00EDculo")))),
        sub === 'perguntas' && pode(user, 'checklist.perguntas') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card" },
                React.createElement("h3", { style: { marginBottom: 10 } }, editandoPergunta ? 'Editar pergunta' : 'Nova pergunta'),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "adm-checklist-texto" }, "Texto"),
                        React.createElement("input", { id: "adm-checklist-texto", name: "adm-checklist-texto", autoComplete: "off", value: novaPerg.texto, onChange: e => setNovaPerg({ ...novaPerg, texto: e.target.value }), placeholder: "Ex.: Cintas e catracas de amarra\u00E7\u00E3o em condi\u00E7\u00F5es" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-tipoveiculo" }, "TipoVe\u00EDculo"),
                        React.createElement("select", { id: "adm-checklist-tipoveiculo", name: "adm-checklist-tipoveiculo", value: novaPerg.frota, onChange: e => setNovaPerg({ ...novaPerg, frota: e.target.value }) },
                            React.createElement("option", { value: "leve" }, "FROTA LEVE"),
                            React.createElement("option", { value: "pesada" }, "FROTA PESADA"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-grupo" }, "Grupo"),
                        React.createElement("select", { id: "adm-checklist-grupo", name: "adm-checklist-grupo", value: novaPerg.grupo, onChange: e => setNovaPerg({ ...novaPerg, grupo: e.target.value }) },
                            React.createElement("option", { value: "Anomalias est\u00E9ticas" }, "Anomalias est\u00E9ticas"),
                            React.createElement("option", { value: "Anomalias mec\u00E2nicas" }, "Anomalias mec\u00E2nicas"),
                            React.createElement("option", { value: "Anomalias el\u00E9tricas" }, "Anomalias el\u00E9tricas"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-frequencia" }, "Frequ\u00EAncia"),
                        React.createElement("select", { id: "adm-checklist-frequencia", name: "adm-checklist-frequencia", value: novaPerg.frequencia, onChange: e => setNovaPerg({ ...novaPerg, frequencia: e.target.value }) },
                            React.createElement("option", { value: "Di\u00E1ria" }, "Di\u00E1ria"),
                            React.createElement("option", { value: "Semanal" }, "Semanal"),
                            React.createElement("option", { value: "Mensal" }, "Mensal"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-ordem-dentro-do-grupo" }, "Ordem dentro do grupo"),
                        React.createElement("input", { id: "adm-checklist-ordem-dentro-do-grupo", name: "adm-checklist-ordem-dentro-do-grupo", autoComplete: "off", type: "number", min: "0", step: "1", value: novaPerg.ordem, onChange: e => setNovaPerg({ ...novaPerg, ordem: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-resposta-obrigatoria" }, "Resposta obrigat\u00F3ria?"),
                        React.createElement("select", { id: "adm-checklist-resposta-obrigatoria", name: "adm-checklist-resposta-obrigatoria", value: novaPerg.obrigatoria ? 's' : 'n', onChange: e => setNovaPerg({ ...novaPerg, obrigatoria: e.target.value === 's' }) },
                            React.createElement("option", { value: "s" }, "Sim"),
                            React.createElement("option", { value: "n" }, "N\u00E3o"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-checklist-foto-obrigatoria-se-nc" }, "Foto obrigat\u00F3ria se NC?"),
                        React.createElement("select", { id: "adm-checklist-foto-obrigatoria-se-nc", name: "adm-checklist-foto-obrigatoria-se-nc", value: novaPerg.fotoNC ? 's' : 'n', onChange: e => setNovaPerg({ ...novaPerg, fotoNC: e.target.value === 's' }) },
                            React.createElement("option", { value: "n" }, "N\u00E3o"),
                            React.createElement("option", { value: "s" }, "Sim")))),
                React.createElement("div", { className: "row", style: { marginTop: 12 } },
                    React.createElement("button", { className: "btn btn-p", onClick: salvarPergunta }, editandoPergunta ? 'Salvar alterações' : 'Adicionar pergunta'),
                    editandoPergunta && React.createElement("button", { className: "btn btn-s", onClick: () => { setEditandoPergunta(null); setNovaPerg(perguntaVazia); } }, "Cancelar edi\u00E7\u00E3o"))),
            React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
                React.createElement("div", { className: "subtabs grow" }, [['pesada', 'Frota pesada'], ['leve', 'Frota leve'], ['todas', 'Todas']].map(([v, l]) => React.createElement("button", { key: v, className: 'subtab' + (fFrota === v ? ' on' : ''), onClick: () => setFFrota(v) }, l))),
                React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoCatalogo, onClick: carregarCatalogo }, carregandoCatalogo ? 'Atualizando...' : 'Atualizar do banco D1 de homologação')),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Pergunta"),
                            React.createElement("th", null, "Grupo"),
                            React.createElement("th", null, "Ordem"),
                            React.createElement("th", null, "TipoVe\u00EDculo"),
                            React.createElement("th", null, "Frequ\u00EAncia"),
                            React.createElement("th", null, "Obrigat\u00F3ria"),
                            React.createElement("th", null, "Foto se NC"),
                            React.createElement("th", null, "Ativa"),
                            React.createElement("th", null, "A\u00E7\u00F5es"))),
                    React.createElement("tbody", null, st.perguntas.filter(p => fFrota === 'todas' || p.frota === fFrota || p.frota === 'ambas').map(p => React.createElement("tr", { key: p.id, style: { opacity: p.ativa ? 1 : .45 } },
                        React.createElement("td", null, p.texto),
                        React.createElement("td", { className: "muted" }, p.grupo),
                        React.createElement("td", null,
                            React.createElement("b", null, p.ordem)),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-neutro" }, p.frota === 'leve' ? 'Frota leve' : 'Frota pesada')),
                        React.createElement("td", null,
                            React.createElement("span", { className: "tag tag-neutro" }, p.frequencia || 'Diária')),
                        React.createElement("td", null, p.obrigatoria ? 'Sim' : 'Não'),
                        React.createElement("td", null, p.fotoNC ? 'Sim' : 'Não'),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag ' + (p.ativa ? 'tag-ok' : 'tag-neg') }, p.ativa ? 'Ativa' : 'Inativa')),
                        React.createElement("td", null,
                            React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                                React.createElement("button", { className: "btn btn-s btn-sm", onClick: () => iniciarEdicao(p) }, "Editar"),
                                React.createElement("button", { className: 'btn btn-sm ' + (p.ativa ? 'btn-s' : 'btn-p'), onClick: () => alternarPergunta(p) }, p.ativa ? 'Inativar' : 'Reativar'))))))))),
        sub === 'relatorio' && pode(user, 'checklist.relatorio') && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
                React.createElement("div", { className: "row", style: { gap: 6, flexWrap: 'nowrap' } },
                    React.createElement("input", { type: "month", "aria-label": "Filtrar relat\u00F3rio por m\u00EAs", style: { width: 'auto' }, value: fMes, onChange: e => setFMes(e.target.value) }),
                    React.createElement("button", { className: "btn btn-g btn-sm", type: "button", onClick: () => setFMes('') }, "Todos os meses")),
                React.createElement("select", { style: { width: 'auto' }, value: fPlaca, onChange: e => setFPlaca(e.target.value) },
                    React.createElement("option", { value: "todas" }, "Todas as placas"),
                    placas.map(p => React.createElement("option", { key: p, value: p }, p))),
                React.createElement("select", { style: { width: 'auto' }, value: fMot, onChange: e => setFMot(e.target.value) },
                    React.createElement("option", { value: "todos" }, "Todos os motoristas"),
                    motoristas.map(m => React.createElement("option", { key: m, value: m }, primeiroNome(m)))),
                React.createElement("select", { style: { width: 'auto' }, value: fStatus, onChange: e => setFStatus(e.target.value) },
                    React.createElement("option", { value: "todos" }, "Todos os status"),
                    React.createElement("option", { value: "pendente" }, "Aguardando an\u00E1lise"),
                    React.createElement("option", { value: "aprovado" }, "Aprovados"),
                    React.createElement("option", { value: "reprovado" }, "Reprovados")),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { setFMes(''); setFPlaca('todas'); setFMot('todos'); setFStatus('todos'); } }, "Limpar filtros")),
            React.createElement("div", { className: "totais" },
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num" }, totaisRelatorio.total),
                    React.createElement("div", { className: "l" }, "Checklists")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: 'var(--mata)' } }, totaisRelatorio.aprovados),
                    React.createElement("div", { className: "l" }, "Aprovados")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num", style: { color: totaisRelatorio.reprovados ? 'var(--erro)' : 'var(--mata)' } }, totaisRelatorio.reprovados),
                    React.createElement("div", { className: "l" }, "Reprovados")),
                React.createElement("div", { className: "card" },
                    React.createElement("div", { className: "v num" }, totaisRelatorio.pendentes),
                    React.createElement("div", { className: "l" }, "Aguardando"))),
            relatorio.length === 0 && React.createElement("div", { className: "card muted" }, "Nenhum checklist encontrado nos filtros selecionados."),
            relatorio.map(ck => React.createElement("div", { className: "card row", key: ck.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null, primeiroNome(ck.motorista)),
                    " ",
                    React.createElement("span", { className: "muted" },
                        "\u00B7 ",
                        dataBR(ck.data),
                        " \u00B7 ",
                        ck.placa),
                    React.createElement("div", { className: "muted" },
                        ck.respostas.filter(r => r.resp === 'NC').length,
                        " NC \u00B7 ",
                        ck.respostas.filter(r => r.foto).length,
                        " foto(s)")),
                React.createElement(StatusTag, { s: ck.status }),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => abrirDetalhe(ck) }, "Ver")))),
        ver && !reprovando &&
            React.createElement(ChecklistDetalhe, { ck: ver, perguntas: st.perguntas, onClose: () => setVer(null), acoes: ver.status === 'pendente' &&
                    React.createElement("div", null,
                        React.createElement("div", { className: "card", style: { boxShadow: 'none', border: '1px solid var(--linha)', marginBottom: 10 } },
                            React.createElement("label", { htmlFor: "adm-checklist-bloquear-o-veiculo-apos-aprovar" }, "Bloquear o ve\u00EDculo ap\u00F3s aprovar?"),
                            React.createElement("select", { id: "adm-checklist-bloquear-o-veiculo-apos-aprovar", name: "adm-checklist-bloquear-o-veiculo-apos-aprovar", value: bloquearAoAprovar ? 's' : 'n', onChange: e => setBloquearAoAprovar(e.target.value === 's') },
                                React.createElement("option", { value: "n" }, "N\u00E3o"),
                                React.createElement("option", { value: "s" }, "Sim")),
                            bloquearAoAprovar && React.createElement("div", { style: { marginTop: 10 } },
                                React.createElement("label", { htmlFor: "adm-checklist-motivo-do-bloqueio" }, "Motivo do bloqueio"),
                                React.createElement("textarea", { id: "adm-checklist-motivo-do-bloqueio", name: "adm-checklist-motivo-do-bloqueio", rows: "2", value: motivoBloqueio, onChange: e => setMotivoBloqueio(e.target.value), placeholder: "Ex.: pneu com avaria impeditiva; aguardar manuten\u00E7\u00E3o." }))),
                        React.createElement("div", { className: "row" },
                            React.createElement("button", { className: "btn btn-d grow", onClick: () => setReprovando(ver) }, "Reprovar"),
                            React.createElement("button", { className: "btn btn-p grow", onClick: () => decidir(ver, 'aprovado', '', { bloquearVeiculo: bloquearAoAprovar, motivoBloqueio }) }, "Aprovar"))) }),
        reprovando &&
            React.createElement(Modal, { titulo: "Reprovar check list", onClose: () => setReprovando(null) },
                React.createElement("label", { htmlFor: "adm-checklist-motivo-o-motorista-vera-e-devera-refazer" }, "Motivo (o motorista ver\u00E1 e dever\u00E1 refazer)"),
                React.createElement("textarea", { id: "adm-checklist-motivo-o-motorista-vera-e-devera-refazer", name: "adm-checklist-motivo-o-motorista-vera-e-devera-refazer", rows: "3", value: motivoRep, onChange: e => setMotivoRep(e.target.value), placeholder: "Ex.: foto do vazamento n\u00E3o permite identificar o local; refazer com foto mais pr\u00F3xima." }),
                React.createElement("button", { className: "btn btn-d", style: { width: '100%', marginTop: 12 }, onClick: () => { if (!motivoRep.trim()) {
                        toast('Informe o motivo da reprovação.');
                        return;
                    } decidir(reprovando, 'reprovado', motivoRep.trim()); } }, "Confirmar reprova\u00E7\u00E3o")),
        liberandoVeiculo && React.createElement(Modal, { titulo: 'Liberar veículo ' + liberandoVeiculo.placa, onClose: () => setLiberandoVeiculo(null) },
            React.createElement("div", { className: "aviso-box" },
                "Motivo atual: ",
                liberandoVeiculo.motivo || 'Não informado'),
            React.createElement("label", { htmlFor: "adm-checklist-observacao-da-liberacao" }, "Observa\u00E7\u00E3o da libera\u00E7\u00E3o"),
            React.createElement("textarea", { id: "adm-checklist-observacao-da-liberacao", name: "adm-checklist-observacao-da-liberacao", rows: "3", value: observacaoLiberacao, onChange: e => setObservacaoLiberacao(e.target.value), placeholder: "Ex.: manuten\u00E7\u00E3o conclu\u00EDda e ve\u00EDculo conferido." }),
            React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 12 }, onClick: liberarVeiculo }, "Confirmar libera\u00E7\u00E3o"))));
}
