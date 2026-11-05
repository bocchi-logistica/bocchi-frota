/* ================= MOTORISTA: SINISTRO ================= */
function TelaSinistro({ user, toast }) {
    const [veiculos, setVeiculos] = useState([]);
    const [agendamentoAtual, setAgendamentoAtual] = useState(null);
    const [historico, setHistorico] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [contatoEmergencia, setContatoEmergencia] = useState({ nome: 'Logística', telefone: '' });
    const [registroAberto, setRegistroAberto] = useState(null);
    const [carregandoRegistro, setCarregandoRegistro] = useState(false);
    const [complementos, setComplementos] = useState({});
    const [enviandoDocumentoId, setEnviandoDocumentoId] = useState('');
    const [form, setForm] = useState({
        placa: '', motoristaNome: user.nome || '', motoristaTelefone: '', dataHoraOcorrido: '',
        localOcorrido: '', municipio: '', uf: 'RS', tipoOcorrencia: '', tipoSinistro: '', descricaoOcorrido: '',
        possuiVitima: false, possuiTerceiro: false, veiculoImobilizado: false, necessitaGuincho: false,
        autoridadeAcionada: false, numeroBoletim: '', responsabilidadeInicial: 'Ainda não definida'
    });
    const [arquivos, setArquivos] = useState([]);
    const sinistroEnvioRef = useRef(null);
    const carregar = async () => {
        setCarregando(true);
        try {
            const [rv, rh, rc] = await Promise.allSettled([ApiService.obterVeiculos(), ApiService.obterMeusSinistros(), ApiService.obterContatoSinistros()]);
            let lista = rv.status === 'fulfilled' ? (rv.value.veiculos || []).filter(v => v.placa) : [];
            let ag = null;
            const precisaAgendamento = Boolean(user?.perms?.agendamentos && lista.some(v => v.usoCompartilhado === true && !normalizar(v.tipoFrota).includes('pesada')));
            if (precisaAgendamento) {
                try {
                    const ra = await ApiService.contextoAgendamentoAtual();
                    const bruto = ra?.agendamento || null;
                    const st = String(bruto?.status || '').trim().toUpperCase();
                    if (['EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO'].includes(st))
                        ag = bruto;
                }
                catch { }
            }
            setAgendamentoAtual(ag);
            lista = lista.filter(v => v.usoCompartilhado !== true || Boolean(ag?.placa && normalizar(v.placa) === normalizar(ag.placa)));
            if (ag?.placa && !lista.some(v => normalizar(v.placa) === normalizar(ag.placa)))
                lista = [...lista, { itemId: ag.veiculoId || '', placa: ag.placa, tipoFrota: 'FROTA LEVE', tipoModelo: ag.tipoModelo || '', modelo: ag.modelo || '', usoCompartilhado: true, principal: false }];
            setVeiculos(lista);
            const principal = lista.find(v => v.principal && v.usoCompartilhado !== true), agendado = ag?.placa ? lista.find(v => normalizar(v.placa) === normalizar(ag.placa)) : null, preferido = agendado || principal || lista[0] || null;
            setForm(f => ({ ...f, placa: lista.some(v => v.placa === f.placa) ? f.placa : (preferido?.placa || '') }));
            if (rh.status === 'fulfilled')
                setHistorico(rh.value.sinistros || []);
            if (rc.status === 'fulfilled' && rc.value?.contato)
                setContatoEmergencia({ nome: rc.value.contato.nome || 'Logística', telefone: rc.value.contato.telefone || '' });
        }
        finally {
            setCarregando(false);
        }
    };
    useEffect(() => { carregar(); }, []);
    useAtualizacaoPortal(['sinistros'], async () => { const r = await ApiService.obterMeusSinistros(); setHistorico(r.sinistros || []); });
    const veiculoSelecionado = veiculos.find(v => normalizar(v.placa) === normalizar(form.placa)) || null;
    const ehFrotaPesada = Boolean(veiculoSelecionado && normalizar(veiculoSelecionado.tipoFrota).includes('pesada'));
    const exigeAgendamento = Boolean(veiculoSelecionado && !ehFrotaPesada && veiculoSelecionado.usoCompartilhado === true);
    const agendamentoDaPlaca = Boolean(agendamentoAtual && normalizar(agendamentoAtual.placa) === normalizar(form.placa));
    const bloqueioAgendamento = Boolean(exigeAgendamento && (!user?.perms?.agendamentos || !agendamentoDaPlaca));
    const converterArquivos = async (lista, limiteQtd = 12) => {
        const permitidos = [...lista].slice(0, limiteQtd);
        const convertidos = [];
        let totalConvertido = 0;
        for (const f of permitidos) {
            let nome = f.name, tipo = f.type || 'application/octet-stream', conteudoBase64 = '', tamanhoFinal = f.size;
            if (String(f.type || '').toLowerCase().startsWith('image/')) {
                try {
                    conteudoBase64 = await comprimirImagem(f);
                    tipo = 'image/jpeg';
                    nome = String(f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
                    tamanhoFinal = Math.round((conteudoBase64.split(',')[1] || '').length * 0.75);
                }
                catch (e) {
                    if (f.size > 4 * 1024 * 1024) {
                        toast('A foto ' + f.name + ' é maior que 4 MB e não pôde ser otimizada automaticamente. Tente outra foto.');
                        continue;
                    }
                }
            }
            if (!conteudoBase64) {
                if (f.size > 4 * 1024 * 1024) {
                    toast('O arquivo ' + f.name + ' ultrapassa 4 MB. Para fotos, a Plataforma reduz automaticamente; outros arquivos precisam estar abaixo desse limite.');
                    continue;
                }
                conteudoBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(new Error('Falha ao ler ' + f.name)); r.readAsDataURL(f); });
                tamanhoFinal = f.size;
            }
            if (tamanhoFinal > 4 * 1024 * 1024) {
                toast('O arquivo ' + nome + ' ainda ultrapassa 4 MB após a otimização.');
                continue;
            }
            if (totalConvertido + tamanhoFinal > 18 * 1024 * 1024) {
                toast('Os anexos ultrapassam 18 MB após a otimização. Envie em menos arquivos.');
                break;
            }
            totalConvertido += tamanhoFinal;
            convertidos.push({ nome, tipo, conteudoBase64, tamanho: tamanhoFinal });
        }
        return convertidos;
    };
    const lerArquivos = async (lista) => setArquivos(await converterArquivos(lista, 12));
    const enviar = async () => {
        const obrigatorios = [[form.tipoOcorrencia, 'Selecione o tipo de ocorrência.'], [form.tipoSinistro, 'Informe o detalhe da ocorrência.'], [form.placa, 'Selecione a placa.'], [form.motoristaNome, 'Informe o nome do motorista.'], [form.dataHoraOcorrido, 'Informe a data e hora do ocorrido.'], [form.localOcorrido, 'Informe o local.'], [form.descricaoOcorrido, 'Descreva o ocorrido.']];
        const falta = obrigatorios.find(([v]) => !String(v || '').trim());
        if (falta) {
            toast(falta[1]);
            return;
        }
        if (bloqueioAgendamento) {
            toast('Esta placa é Frota Leve compartilhada e precisa estar no seu agendamento atual.');
            return;
        }
        if (form.possuiVitima && !window.confirm('Você informou que há vítima. Confirma o envio imediato deste registro?'))
            return;
        if (!window.confirm('Confirma o envio da ocorrência da placa ' + form.placa + '? A ocorrência será registrada para a Logística.'))
            return;
        setEnviando(true);
        try {
            if (!sinistroEnvioRef.current) sinistroEnvioRef.current = gerarUUID();
            const r = await ApiService.criarSinistro({ ...form, arquivos, idLocal: sinistroEnvioRef.current });
            sinistroEnvioRef.current = null;
            const avisoEmail = r.emailEnviado ? ' · E-mail disparado.' : ' · Atenção: e-mail não confirmado.';
            const avisoCampo = Array.isArray(r.avisosCampos) && r.avisosCampos.length ? ' · Registro salvo com aviso técnico.' : '';
            toast('Ocorrência enviada. Protocolo: ' + r.numeroSinistro + avisoEmail + avisoCampo);
            setArquivos([]);
            setForm(f => ({ ...f, dataHoraOcorrido: '', localOcorrido: '', municipio: '', tipoOcorrencia: '', tipoSinistro: '', descricaoOcorrido: '', possuiVitima: false, possuiTerceiro: false, veiculoImobilizado: false, necessitaGuincho: false, autoridadeAcionada: false, numeroBoletim: '', responsabilidadeInicial: 'Ainda não definida' }));
            try {
                const resumo = await ApiService.obterMeusSinistros();
                setHistorico(resumo.sinistros || []);
            }
            catch { }
        }
        catch (e) {
            toast('Não foi possível enviar a ocorrência: ' + e.message);
        }
        finally {
            setEnviando(false);
        }
    };
    const abrirRegistro = async (s) => {
        setCarregandoRegistro(true);
        try {
            const r = await ApiService.obterSinistro(s.id);
            setRegistroAberto(r.sinistro || null);
            setComplementos({});
        }
        catch (e) {
            toast('Não foi possível abrir o sinistro: ' + e.message);
        }
        finally {
            setCarregandoRegistro(false);
        }
    };
    const selecionarComplemento = async (docId, files) => {
        const atuais = Array.isArray(complementos?.[docId]?.arquivos) ? complementos[docId].arquivos : [];
        const restantes = Math.max(0, 8 - atuais.length);
        if (!restantes) {
            toast('Limite de 8 arquivos por solicitação.');
            return;
        }
        const selecionados = [...files].slice(0, restantes), conv = [];
        let total = atuais.reduce((s, a) => s + Number(a?.tamanho || a?.blob?.size || 0), 0);
        for (const f of selecionados) {
            try {
                const item = await otimizarArquivoBinario(f);
                const duplicado = atuais.some(a => String(a?.chave || '') === String(item?.chave || '') && item?.chave);
                if (duplicado)
                    continue;
                if (total + item.tamanho > 18 * 1024 * 1024) {
                    toast('Os arquivos ultrapassam 18 MB após a otimização. Envie em menos arquivos.');
                    break;
                }
                total += item.tamanho;
                conv.push(item);
            }
            catch (e) {
                toast(e.message || ('Não foi possível preparar ' + f.name));
            }
        }
        if (!conv.length)
            return;
        setComplementos(prev => {
            const base = Array.isArray(prev?.[docId]?.arquivos) ? prev[docId].arquivos : [];
            const combinados = [...base];
            for (const item of conv) {
                if (combinados.length >= 8)
                    break;
                if (item?.chave && combinados.some(a => String(a?.chave || '') === String(item.chave)))
                    continue;
                combinados.push(item);
            }
            return { ...prev, [docId]: { ...(prev[docId] || {}), arquivos: combinados } };
        });
    };
    const removerComplementoArquivo = (docId, indice) => setComplementos(prev => {
        const atual = prev?.[docId] || {};
        return { ...prev, [docId]: { ...atual, arquivos: (atual.arquivos || []).filter((_, i) => i !== indice) } };
    });
    const enviarComplemento = async (doc) => {
        const dados = complementos[doc.id] || {};
        if (!Array.isArray(dados.arquivos) || !dados.arquivos.length) {
            toast('Selecione o arquivo solicitado.');
            return;
        }
        setEnviandoDocumentoId(doc.id);
        try {
            const enviados = [];
            for (let i = 0; i < dados.arquivos.length; i++) {
                const retorno = await ApiService.enviarArquivoDocumentoSinistro(registroAberto.id, doc.id, dados.arquivos[i]);
                if (retorno?.arquivo)
                    enviados.push(retorno.arquivo);
            }
            const fim = await ApiService.finalizarDocumentoSinistro(registroAberto.id, doc.id, { arquivos: enviados, observacaoMotorista: String(dados.observacao || '').trim() });
            const atualizado = fim.solicitacao || { ...doc, statusDocumento: 'Enviado', arquivos: enviados };
            setRegistroAberto(atual => ({ ...atual, solicitacoesDocumentos: (atual?.solicitacoesDocumentos || []).map(x => String(x.id) === String(doc.id) ? atualizado : x) }));
            setHistorico(lista => lista.map(s => String(s.id) === String(registroAberto.id) ? { ...s, documentosResumo: (() => { const docs = (registroAberto.solicitacoesDocumentos || []).map(x => String(x.id) === String(doc.id) ? atualizado : x); return { totalAtivos: docs.filter(x => x.ativo !== false).length, pendentesEnvio: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'PENDENTE_DE_ENVIO').length, enviados: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'ENVIADO').length, aceitos: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'ACEITO').length, rejeitados: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'REJEITADO').length, dispensados: docs.filter(x => normalizarPerfil(x.statusDocumento) === 'DISPENSADO').length }; })() } : s));
            setComplementos(prev => ({ ...prev, [doc.id]: { arquivos: [], observacao: '' } }));
            toast('Documento enviado para conferência da Logística.');
        }
        catch (e) {
            toast('Não foi possível enviar o documento: ' + e.message);
        }
        finally {
            setEnviandoDocumentoId('');
        }
    };
    const configuracaoOcorrencias = {
        'Acidente': {
            detalhes: ['Colisão', 'Abalroamento', 'Saída de pista', 'Tombamento', 'Capotamento', 'Incêndio', 'Fenômeno da natureza', 'Outro'],
            orientacoes: ['Proteja as pessoas e sinalize o local.', 'Acione autoridade ou emergência quando necessário.', 'Não assuma responsabilidade antes da análise da Logística.', 'Fotografe o local, veículos, placas, avarias e painel.'],
            evidencias: ['B.O. se houver', 'Fotos do local', 'Fotos dos veículos', 'Placas e avarias', 'Documentos do terceiro, se houver']
        },
        'Pane': {
            detalhes: ['Pane mecânica', 'Pane elétrica', 'Pneu / roda', 'Iluminação', 'Outro'],
            orientacoes: ['Pare em local seguro e sinalize quando necessário.', 'Não force o funcionamento do veículo.', 'Informe os sintomas e luzes do painel.'],
            evidencias: ['Foto do painel', 'Foto do componente/área afetada', 'Fotos do veículo/local']
        },
        'Avaria': {
            detalhes: ['Quebra de vidro', 'Pneu / roda', 'Iluminação', 'Outro'],
            orientacoes: ['Avalie se é seguro continuar rodando.', 'Fotografe claramente a avaria antes de qualquer intervenção.', 'Informe à Logística o que foi danificado.'],
            evidencias: ['Fotos da avaria', 'Foto geral do veículo', 'Foto do painel, se aplicável']
        },
        'Furto / Roubo / Vandalismo': {
            detalhes: ['Furto', 'Roubo', 'Vandalismo'],
            orientacoes: ['Priorize sua segurança e não confronte envolvidos.', 'Acione a autoridade competente.', 'Preserve evidências e informe a Logística imediatamente.'],
            evidencias: ['B.O. se disponível', 'Fotos do local/veículo', 'Outras evidências disponíveis']
        },
        'Outro': {
            detalhes: ['Outro'],
            orientacoes: ['Pare em local seguro quando necessário.', 'Descreva objetivamente a situação e aguarde orientação da Logística.'],
            evidencias: ['Fotos que ajudem a identificar a situação']
        }
    };
    const configOcorrencia = configuracaoOcorrencias[form.tipoOcorrencia] || null;
    const selecionarTipoOcorrencia = tipo => {
        const cfg = configuracaoOcorrencias[tipo];
        const exigeCamposAcidente = tipo === 'Acidente';
        const exigeAutoridade = tipo === 'Acidente' || tipo === 'Furto / Roubo / Vandalismo';
        setForm(f => ({ ...f,
            tipoOcorrencia: tipo,
            tipoSinistro: cfg?.detalhes?.includes(f.tipoSinistro) ? f.tipoSinistro : (cfg?.detalhes?.[0] || 'Outro'),
            possuiVitima: exigeCamposAcidente ? f.possuiVitima : false,
            possuiTerceiro: exigeCamposAcidente ? f.possuiTerceiro : false,
            autoridadeAcionada: exigeAutoridade ? f.autoridadeAcionada : false,
            numeroBoletim: exigeAutoridade ? f.numeroBoletim : '',
            responsabilidadeInicial: exigeCamposAcidente ? (f.responsabilidadeInicial === 'Não se aplica' ? 'Ainda não definida' : f.responsabilidadeInicial) : 'Não se aplica'
        }));
    };
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "card sinistro-hero sinistro-bloco-compacto" },
            React.createElement("div", { className: "row" },
                React.createElement("div", { style: { fontSize: 30 } }, "\uD83D\uDEA8"),
                React.createElement("div", { className: "grow" },
                    React.createElement("h2", { style: { marginBottom: 2 } }, "Comunicar ocorr\u00EAncia"),
                    React.createElement("div", { className: "muted" }, "Escolha o que aconteceu para visualizar somente as orienta\u00E7\u00F5es e perguntas necess\u00E1rias.")))),
        React.createElement("div", { className: "card sinistro-bloco-compacto" },
            React.createElement("label", null, "O que aconteceu? *"),
            React.createElement("div", { className: "sinistro-ocorrencia-escolha" }, ['Acidente', 'Pane', 'Avaria', 'Furto / Roubo / Vandalismo', 'Outro'].map(tipo => React.createElement("button", { type: "button", key: tipo, className: 'sinistro-ocorrencia-btn' + (form.tipoOcorrencia === tipo ? ' on' : '') + (tipo === 'Furto / Roubo / Vandalismo' ? ' largo' : ''), onClick: () => selecionarTipoOcorrencia(tipo) }, tipo)))),
        configOcorrencia && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card sinistro-bloco-compacto", style: { border: '1.5px solid rgba(20,78,58,.22)', background: 'rgba(20,78,58,.055)' } },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { style: { fontSize: 25 } }, "\uD83D\uDCDE"),
                    React.createElement("div", { className: "grow" },
                        React.createElement("div", { className: "muted", style: { fontSize: 11, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' } }, "Contato da Log\u00EDstica"),
                        React.createElement("b", null, contatoEmergencia.nome || 'Logística'),
                        !contatoEmergencia.telefone && React.createElement("div", { className: "muted" }, "Telefone n\u00E3o cadastrado.")),
                    contatoEmergencia.telefone && React.createElement("a", { className: "btn btn-p btn-sm", href: 'tel:' + String(contatoEmergencia.telefone).replace(/[^0-9+]/g, '') },
                        "Ligar ",
                        contatoEmergencia.telefone))),
            React.createElement("div", { className: "card sinistro-bloco-compacto" },
                React.createElement("div", { className: "row" },
                    React.createElement("h3", { className: "grow", style: { margin: 0 } }, "Antes de enviar"),
                    React.createElement("span", { className: "tag tag-neutro" }, form.tipoOcorrencia)),
                React.createElement("div", { className: "sinistro-orientacao-compacta" }, configOcorrencia.orientacoes.map(x => React.createElement("div", { className: "sinistro-orientacao-item", key: x }, x))),
                React.createElement("div", { className: "muted", style: { marginTop: 10, fontSize: 12, fontWeight: 700 } }, "Evid\u00EAncias \u00FAteis"),
                React.createElement("div", { className: "sinistro-evidencias-compactas" }, configOcorrencia.evidencias.map(x => React.createElement("span", { className: "sinistro-evidencia-chip", key: x }, x)))),
            bloqueioAgendamento && React.createElement("div", { className: "aviso-box" }, "A placa selecionada \u00E9 Frota Leve compartilhada. Para este tipo de ve\u00EDculo, a ocorr\u00EAncia s\u00F3 pode ser enviada quando a placa estiver no seu agendamento atual."),
            React.createElement("div", { className: "card sinistro-bloco-compacto" },
                React.createElement("h3", { style: { marginBottom: 10 } }, "Dados da ocorr\u00EAncia"),
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-detalhe-da-ocorrencia" }, "Detalhe da ocorr\u00EAncia *"),
                        React.createElement("select", { id: "tela-sinistro-detalhe-da-ocorrencia", name: "tela-sinistro-detalhe-da-ocorrencia", value: form.tipoSinistro, onChange: e => setForm({ ...form, tipoSinistro: e.target.value }) }, (configOcorrencia.detalhes || ['Outro']).map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-placa" }, "Placa *"),
                        React.createElement("select", { id: "tela-sinistro-placa", name: "tela-sinistro-placa", value: form.placa, onChange: e => setForm({ ...form, placa: e.target.value }) },
                            React.createElement("option", { value: "" }, "Selecionar..."),
                            veiculos.map(v => React.createElement("option", { key: v.itemId || v.placa, value: v.placa },
                                v.placa,
                                v.tipoFrota ? ' · ' + v.tipoFrota : '',
                                v.usoCompartilhado ? ' · compartilhado' : ' · por vínculo')))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-data-e-hora" }, "Data e hora *"),
                        React.createElement("input", { id: "tela-sinistro-data-e-hora", name: "tela-sinistro-data-e-hora", autoComplete: "off", type: "datetime-local", value: form.dataHoraOcorrido, onChange: e => setForm({ ...form, dataHoraOcorrido: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-motorista" }, "Motorista *"),
                        React.createElement("input", { id: "tela-sinistro-motorista", name: "tela-sinistro-motorista", autoComplete: "off", value: form.motoristaNome, onChange: e => setForm({ ...form, motoristaNome: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-telefone" }, "Telefone"),
                        React.createElement("input", { id: "tela-sinistro-telefone", name: "tela-sinistro-telefone", autoComplete: "off", value: form.motoristaTelefone, onChange: e => setForm({ ...form, motoristaTelefone: e.target.value }), placeholder: "(54) 99999-9999" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-municipio" }, "Munic\u00EDpio"),
                        React.createElement("input", { id: "tela-sinistro-municipio", name: "tela-sinistro-municipio", autoComplete: "off", value: form.municipio, onChange: e => setForm({ ...form, municipio: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-uf" }, "UF"),
                        React.createElement("select", { id: "tela-sinistro-uf", name: "tela-sinistro-uf", value: form.uf, onChange: e => setForm({ ...form, uf: e.target.value }) }, ['RS', 'SC', 'PR', 'SP', 'MG', 'RJ', 'ES', 'MS', 'MT', 'GO', 'DF', 'BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA', 'TO', 'PA', 'AP', 'AM', 'RR', 'RO', 'AC'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "tela-sinistro-local" }, "Local *"),
                        React.createElement("input", { id: "tela-sinistro-local", name: "tela-sinistro-local", autoComplete: "off", value: form.localOcorrido, onChange: e => setForm({ ...form, localOcorrido: e.target.value }), placeholder: "Rodovia, km, endere\u00E7o ou refer\u00EAncia" }))),
                React.createElement("div", { className: "form-grid", style: { marginTop: 10 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-veiculo-imobilizado" }, "Ve\u00EDculo imobilizado?"),
                        React.createElement("select", { id: "tela-sinistro-veiculo-imobilizado", name: "tela-sinistro-veiculo-imobilizado", value: form.veiculoImobilizado ? 'sim' : 'nao', onChange: e => setForm({ ...form, veiculoImobilizado: e.target.value === 'sim' }) },
                            React.createElement("option", { value: "nao" }, "N\u00E3o"),
                            React.createElement("option", { value: "sim" }, "Sim"))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-sinistro-precisa-de-guincho" }, "Precisa de guincho?"),
                        React.createElement("select", { id: "tela-sinistro-precisa-de-guincho", name: "tela-sinistro-precisa-de-guincho", value: form.necessitaGuincho ? 'sim' : 'nao', onChange: e => setForm({ ...form, necessitaGuincho: e.target.value === 'sim' }) },
                            React.createElement("option", { value: "nao" }, "N\u00E3o"),
                            React.createElement("option", { value: "sim" }, "Sim"))),
                    form.tipoOcorrencia === 'Acidente' && React.createElement(React.Fragment, null,
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-possui-vitima" }, "Possui v\u00EDtima?"),
                            React.createElement("select", { id: "tela-sinistro-possui-vitima", name: "tela-sinistro-possui-vitima", value: form.possuiVitima ? 'sim' : 'nao', onChange: e => setForm({ ...form, possuiVitima: e.target.value === 'sim' }) },
                                React.createElement("option", { value: "nao" }, "N\u00E3o"),
                                React.createElement("option", { value: "sim" }, "Sim"))),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-possui-terceiro" }, "Possui terceiro?"),
                            React.createElement("select", { id: "tela-sinistro-possui-terceiro", name: "tela-sinistro-possui-terceiro", value: form.possuiTerceiro ? 'sim' : 'nao', onChange: e => setForm({ ...form, possuiTerceiro: e.target.value === 'sim' }) },
                                React.createElement("option", { value: "nao" }, "N\u00E3o"),
                                React.createElement("option", { value: "sim" }, "Sim"))),
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-responsabilidade-inicial" }, "Responsabilidade inicial"),
                            React.createElement("select", { id: "tela-sinistro-responsabilidade-inicial", name: "tela-sinistro-responsabilidade-inicial", value: form.responsabilidadeInicial, onChange: e => setForm({ ...form, responsabilidadeInicial: e.target.value }) }, ['Ainda não definida', 'Possivelmente veículo Bocchi', 'Possivelmente terceiro', 'Responsabilidade compartilhada', 'Não se aplica'].map(x => React.createElement("option", { key: x }, x))))),
                    (form.tipoOcorrencia === 'Acidente' || form.tipoOcorrencia === 'Furto / Roubo / Vandalismo') && React.createElement(React.Fragment, null,
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "tela-sinistro-autoridade-acionada" }, "Autoridade acionada?"),
                            React.createElement("select", { id: "tela-sinistro-autoridade-acionada", name: "tela-sinistro-autoridade-acionada", value: form.autoridadeAcionada ? 'sim' : 'nao', onChange: e => { const sim = e.target.value === 'sim'; setForm({ ...form, autoridadeAcionada: sim, numeroBoletim: sim ? form.numeroBoletim : '' }); } },
                                React.createElement("option", { value: "nao" }, "N\u00E3o"),
                                React.createElement("option", { value: "sim" }, "Sim"))),
                        form.autoridadeAcionada && React.createElement("div", { style: { gridColumn: '1/-1' } },
                            React.createElement("label", { htmlFor: "tela-sinistro-numero-do-b-o-se-disponivel" }, "N\u00FAmero do B.O., se dispon\u00EDvel"),
                            React.createElement("input", { id: "tela-sinistro-numero-do-b-o-se-disponivel", name: "tela-sinistro-numero-do-b-o-se-disponivel", autoComplete: "off", value: form.numeroBoletim, onChange: e => setForm({ ...form, numeroBoletim: e.target.value }), placeholder: "Informe o n\u00FAmero fornecido pela autoridade" }),
                            React.createElement("div", { className: "muted", style: { marginTop: 4 } }, "Se o n\u00FAmero ainda n\u00E3o estiver dispon\u00EDvel, a ocorr\u00EAncia pode ser enviada normalmente.")))),
                form.necessitaGuincho && React.createElement("div", { className: "sinistro-guincho" },
                    React.createElement("b", null, "\uD83D\uDEA8 Guincho necess\u00E1rio"),
                    React.createElement("div", { style: { marginTop: 3 } }, "A Log\u00EDstica receber\u00E1 esta informa\u00E7\u00E3o e far\u00E1 o acionamento. N\u00E3o acione o guincho diretamente.")),
                form.tipoOcorrencia === 'Acidente' && !form.autoridadeAcionada && React.createElement("div", { className: "aviso-box", style: { marginTop: 10 } }, "Sem atendimento policial no local: envie a ocorr\u00EAncia e as evid\u00EAncias. A Log\u00EDstica avaliar\u00E1 o B.O. online quando aplic\u00E1vel."),
                React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("label", { htmlFor: "tela-sinistro-descricao-do-ocorrido" }, "Descri\u00E7\u00E3o do ocorrido *"),
                    React.createElement("textarea", { id: "tela-sinistro-descricao-do-ocorrido", name: "tela-sinistro-descricao-do-ocorrido", rows: "4", value: form.descricaoOcorrido, onChange: e => setForm({ ...form, descricaoOcorrido: e.target.value }), placeholder: form.tipoOcorrencia === 'Pane' ? 'Informe sintomas, ruídos, luzes do painel e o que o veículo apresentou.' : form.tipoOcorrencia === 'Avaria' ? 'Informe o que foi avariado e em que condição o veículo ficou.' : 'Relate de forma objetiva o que ocorreu.' })),
                React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("label", { htmlFor: "tela-sinistro-fotos-e-documentos" }, "Fotos e documentos"),
                    React.createElement("input", { id: "tela-sinistro-fotos-e-documentos", name: "tela-sinistro-fotos-e-documentos", autoComplete: "off", type: "file", multiple: true, accept: "image/*,.pdf,.doc,.docx,video/*", onChange: e => lerArquivos(e.target.files || []) }),
                    React.createElement("div", { className: "muted" }, "Fotos s\u00E3o otimizadas automaticamente. Outros arquivos: at\u00E9 4 MB por arquivo; m\u00E1ximo de 18 MB por envio."),
                    arquivos.map((a, i) => React.createElement("div", { className: "sinistro-arquivo", key: a.nome + i },
                        React.createElement("span", null, "\uD83D\uDCCE"),
                        React.createElement("span", { className: "grow" }, a.nome)))),
                React.createElement("button", { className: "btn btn-d", style: { width: '100%', marginTop: 12 }, disabled: enviando || carregando || bloqueioAgendamento || !form.placa || !form.tipoOcorrencia, onClick: enviar }, enviando ? 'Enviando e notificando...' : 'Enviar ocorrência'))),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "row", style: { marginBottom: 5 } },
                React.createElement("h3", { className: "grow" }, "Meus registros"),
                carregandoRegistro && React.createElement("span", { className: "muted" }, "Abrindo...")),
            historico.length ? historico.map(s => { const sit = situacaoMotoristaSinistro(s); return React.createElement("button", { className: 'sinistro-registro-card' + (sit.chave === 'ACAO_NECESSARIA' ? ' acao' : ''), key: s.id, onClick: () => abrirRegistro(s) },
                React.createElement("span", { className: "grow" },
                    React.createElement("b", null, s.numeroSinistro),
                    React.createElement("span", { className: "muted", style: { display: 'block' } },
                        dataBR(String(s.dataHoraOcorrido || '').slice(0, 10)),
                        " \u00B7 ",
                        s.placa),
                    React.createElement("span", { style: { display: 'block', fontSize: 12, marginTop: 2 } },
                        s.tipoOcorrencia || 'Ocorrência',
                        " \u00B7 ",
                        s.tipoSinistro),
                    React.createElement("span", { className: "muted", style: { display: 'block', marginTop: 5 } }, sit.descricao)),
                React.createElement(SituacaoMotoristaSinistroTag, { sinistro: s }),
                React.createElement("span", { style: { fontSize: 20 } }, "\u2192")); }) : React.createElement("div", { className: "muted" }, "Nenhum registro encontrado.")),
        registroAberto && React.createElement(Modal, { large: true, titulo: registroAberto.numeroSinistro + ' — ' + registroAberto.placa, onClose: () => setRegistroAberto(null) },
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Situa\u00E7\u00E3o"),
                    React.createElement(SituacaoMotoristaSinistroTag, { sinistro: registroAberto }),
                    React.createElement("div", { className: "muted", style: { marginTop: 6 } }, situacaoMotoristaSinistro(registroAberto).descricao)),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Ocorrido"),
                    React.createElement("b", null, dataHoraBRSinistro(registroAberto.dataHoraOcorrido))),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Ocorr\u00EAncia"),
                    React.createElement("b", null, registroAberto.tipoOcorrencia || '—'),
                    React.createElement("div", { className: "muted" }, registroAberto.tipoSinistro),
                    registroAberto.necessitaGuincho && React.createElement("div", { style: { marginTop: 6, fontWeight: 800, color: 'var(--erro)' } }, "\uD83D\uDEA8 Guincho necess\u00E1rio")),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Local"),
                    React.createElement("b", null, registroAberto.localOcorrido),
                    React.createElement("div", { className: "muted" },
                        registroAberto.municipio,
                        " / ",
                        registroAberto.uf))),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("label", null, "Descri\u00E7\u00E3o do ocorrido"),
                React.createElement("div", { style: { whiteSpace: 'pre-wrap' } }, registroAberto.descricaoOcorrido)),
            (registroAberto.solicitacoesDocumentos || []).length > 0 && React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Solicita\u00E7\u00F5es da Log\u00EDstica"),
                React.createElement("div", { className: "muted", style: { marginTop: 3 } }, "Envie somente os documentos solicitados abaixo. Cada item possui acompanhamento pr\u00F3prio."),
                registroAberto.solicitacoesDocumentos.map(doc => { const chave = normalizarPerfil(doc.statusDocumento); const podeEnviar = normalizarPerfil(registroAberto.statusSinistro) === 'AGUARDANDO_DOCUMENTOS' && ['PENDENTE', 'PENDENTE_DE_ENVIO', 'REJEITADO'].includes(chave); const dados = complementos[doc.id] || {}; return React.createElement("div", { className: 'sinistro-documento-item ' + (chave === 'REJEITADO' ? 'rejeitado' : chave === 'PENDENTE_DE_ENVIO' ? 'pendente' : chave === 'ENVIADO' ? 'enviado' : chave === 'ACEITO' ? 'aceito' : 'dispensado'), key: doc.id },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("b", null, doc.tipoDocumento),
                            doc.obrigatorio && React.createElement("span", { className: "muted" }, " \u00B7 obrigat\u00F3rio")),
                        React.createElement(DocumentoStatusTag, { s: doc.statusDocumento })),
                    doc.descricaoSolicitacao && React.createElement("div", { style: { marginTop: 7, whiteSpace: 'pre-wrap' } }, doc.descricaoSolicitacao),
                    doc.motivoRejeicao && React.createElement("div", { className: "erro-box", style: { marginTop: 8 } },
                        React.createElement("b", null, "Motivo para reenviar:"),
                        " ",
                        doc.motivoRejeicao),
                    (doc.arquivos || []).length > 0 && React.createElement(GaleriaArquivosSinistro, { arquivos: doc.arquivos }),
                    podeEnviar && React.createElement("div", { style: { marginTop: 10 } },
                        React.createElement("label", null, chave === 'REJEITADO' ? 'Reenviar arquivo(s)' : 'Adicionar arquivo(s)'),
                        React.createElement("input", { type: "file", multiple: true, accept: "image/*,.pdf,.doc,.docx,video/*", onChange: e => { selecionarComplemento(doc.id, e.target.files || []); e.target.value = ''; } }),
                        React.createElement("div", { className: "muted", style: { marginTop: 5 } }, "At\u00E9 8 arquivos. No celular, voc\u00EA pode selecionar v\u00E1rios de uma vez ou voltar em \u201CEscolher arquivos\u201D para adicionar outros sem perder os j\u00E1 escolhidos."),
                        (dados.arquivos || []).map((a, i) => React.createElement("div", { className: "sinistro-arquivo", key: (a.chave || a.nome) + i },
                            React.createElement("span", null, "\uD83D\uDCCE"),
                            React.createElement("span", { className: "grow" }, a.nome),
                            React.createElement("button", { type: "button", className: "btn btn-g btn-sm", onClick: () => removerComplementoArquivo(doc.id, i) }, "Remover"))),
                        React.createElement("div", { style: { marginTop: 8 } },
                            React.createElement("label", null, "Observa\u00E7\u00E3o (opcional)"),
                            React.createElement("textarea", { rows: "2", value: dados.observacao || '', onChange: e => setComplementos(prev => ({ ...prev, [doc.id]: { ...(prev[doc.id] || {}), observacao: e.target.value } })) })),
                        React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 8 }, disabled: enviandoDocumentoId === doc.id, onClick: () => enviarComplemento(doc) }, enviandoDocumentoId === doc.id ? 'Enviando...' : (chave === 'REJEITADO' ? 'Reenviar documento' : 'Enviar documento'))),
                    chave === 'ENVIADO' && React.createElement("div", { className: "aviso-box", style: { marginTop: 8 } }, "Documento recebido e aguardando confer\u00EAncia da Log\u00EDstica.")); })),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Documentos e evid\u00EAncias do registro inicial"),
                (registroAberto.documentos || []).length ? React.createElement(GaleriaArquivosSinistro, { arquivos: registroAberto.documentos }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Nenhum arquivo no envio inicial.")),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Hist\u00F3rico"),
                (registroAberto.historico || []).length ? (registroAberto.historico || []).map(h => { const p = historicoSinistroApresentacao(h); return React.createElement("div", { className: "linha-item", key: h.id },
                    React.createElement("span", null,
                        React.createElement("b", null, p.acao),
                        React.createElement("span", { className: "muted", style: { display: 'block' } },
                            dataHoraBRSinistro(h.dataHora),
                            " \u00B7 ",
                            h.usuario || h.perfil),
                        p.observacao && React.createElement("span", { style: { display: 'block', marginTop: 3, whiteSpace: 'pre-wrap' } }, p.observacao))); }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Sem movimenta\u00E7\u00F5es adicionais."))));
}

/* ================= ADM: SINISTROS ================= */
function AdmSinistros({ toast, user, foco }) {
    const podeGestao = pode(user, 'sinistros.visualizar');
    const podeConfig = pode(user, 'sinistros.configuracoes');
    const podeEditarConfig = pode(user, 'sinistros.configuracoes.editar');
    const [sub, setSub] = useState(podeGestao ? 'gestao' : 'config');
    const [lista, setLista] = useState([]), [carregando, setCarregando] = useState(false), [selecionado, setSelecionado] = useState(null);
    const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
    const [filtro, setFiltro] = useState({ texto: '', status: 'ABERTOS', gravidade: '', competencia: '', tipoOcorrencia: '' });
    const [edicao, setEdicao] = useState({ statusSinistro: '', gravidade: '', observacao: '' });
    const [solicitacoesNovas, setSolicitacoesNovas] = useState([]);
    const [analisandoDocumento, setAnalisandoDocumento] = useState('');
    const [config, setConfig] = useState(null), [salvandoConfig, setSalvandoConfig] = useState(false);
    const carregar = async () => { if (!podeGestao)
        return; setCarregando(true); try {
        const r = await ApiService.admListarSinistros();
        setLista(r.sinistros || []);
    }
    catch (e) {
        toast('Erro ao carregar sinistros: ' + e.message);
    }
    finally {
        setCarregando(false);
    } };
    useAtualizacaoPortal(['sinistros'], async () => {
        if (!podeGestao || sub !== 'gestao') return;
        const r = await ApiService.admListarSinistros();
        setLista(r.sinistros || []);
    });
    const carregarConfig = async () => { if (!podeConfig)
        return; try {
        const r = await ApiService.admObterConfiguracoesSinistros();
        setConfig(r.configuracao || { titulo: 'Configuração Geral', ativo: true, emailPrincipal: '', emailCopia: '', emailCopiaOculta: '', nomeContatoEmergencia: '', telefoneEmergencia: '', procedimento: '', revisaoProcedimento: 'Revisão 01', permiteReabrirSinistro: false, diasReabertura: 0, enviarEmailAutomatico: false, assuntoEmail: 'URGENTE - Novo Sinistro Registrado', versaoModulo: '1.0', ultimaAtualizacao: '' });
    }
    catch (e) {
        toast('Erro ao carregar configurações: ' + e.message);
    } };
    useEffect(() => { if (podeGestao)
        carregar(); if (podeConfig)
        carregarConfig(); }, []);
    useEffect(() => { if (foco?.chave && podeGestao) {
        setSub('gestao');
        setFiltro(f => ({ ...f, status: 'ABERTOS', competencia: foco.parametros?.competencia || '' }));
    } }, [foco?.chave]);
    useEffect(() => { if (sub === 'gestao' && !podeGestao && podeConfig)
        setSub('config'); if (sub === 'config' && !podeConfig && podeGestao)
        setSub('gestao'); }, [podeGestao, podeConfig]);
    const abrir = async (s) => {
        setCarregandoDetalhe(true);
        try {
            const r = await ApiService.admObterSinistro(s.id);
            const detalhe = r.sinistro || s;
            setSelecionado(detalhe);
            setEdicao({ statusSinistro: detalhe.statusSinistro || 'Aberto', gravidade: detalhe.gravidade || 'Baixa', observacao: '' });
            setSolicitacoesNovas([]);
        }
        catch (e) {
            toast('Erro ao abrir sinistro: ' + e.message);
        }
        finally {
            setCarregandoDetalhe(false);
        }
    };
    const alternarSolicitacao = tipo => setSolicitacoesNovas(prev => prev.some(x => x.tipoDocumento === tipo) ? prev.filter(x => x.tipoDocumento !== tipo) : [...prev, { tipoDocumento: tipo, descricaoSolicitacao: '', obrigatorio: true }]);
    const atualizarSolicitacao = (tipo, campo, valor) => setSolicitacoesNovas(prev => prev.map(x => x.tipoDocumento === tipo ? { ...x, [campo]: valor } : x));
    const salvar = async () => {
        if (!selecionado)
            return;
        const docs = solicitacoesNovas.map(({ tipoDocumento, descricaoSolicitacao, obrigatorio }) => ({ tipoDocumento, descricaoSolicitacao, obrigatorio }));
        if (normalizarPerfil(edicao.statusSinistro) === 'AGUARDANDO_DOCUMENTOS') {
            const existentes = (selecionado.solicitacoesDocumentos || []).filter(d => d.ativo !== false && !['ACEITO', 'DISPENSADO'].includes(normalizarPerfil(d.statusDocumento)));
            if (!docs.length && !existentes.length) {
                toast('Selecione ao menos um documento que o motorista precisa enviar.');
                return;
            }
            const outro = docs.find(d => normalizarPerfil(d.tipoDocumento) === 'OUTRO' && !String(d.descricaoSolicitacao || '').trim());
            if (outro) {
                toast('Descreva qual documento deve ser enviado na opção Outro.');
                return;
            }
        }
        try {
            await ApiService.admAtualizarSinistro(selecionado.id, { ...edicao, documentosSolicitados: docs });
            toast('Sinistro atualizado.');
            setSelecionado(null);
            setSolicitacoesNovas([]);
            await carregar();
        }
        catch (e) {
            toast('Erro ao atualizar sinistro: ' + e.message);
        }
    };
    const analisarDocumento = async (doc, status) => {
        let motivo = '';
        if (status === 'Rejeitado') {
            motivo = window.prompt('Informe o motivo da rejeição. Esta mensagem será exibida ao motorista:', '') || '';
            if (!motivo.trim())
                return;
        }
        if (status === 'Dispensado' && !window.confirm('Dispensar esta solicitação? O motorista não precisará mais enviar este documento.'))
            return;
        setAnalisandoDocumento(doc.id);
        try {
            const r = await ApiService.admAnalisarDocumentoSinistro(selecionado.id, doc.id, status, motivo.trim());
            const docs = r.solicitacoesDocumentos || selecionado.solicitacoesDocumentos || [];
            const novoStatus = r.statusSinistro || selecionado.statusSinistro;
            const agora = new Date().toISOString();
            const historicoDocumento = {
                id: 'auto-doc-' + Date.now(),
                dataHora: agora,
                usuario: user?.login || user?.nome || 'Administrativo',
                perfil: 'Administrativo',
                acao: 'Status alterado',
                status: selecionado.statusSinistro,
                observacao: status === 'Rejeitado'
                    ? 'Documento rejeitado: ' + doc.tipoDocumento + '. Motivo: ' + motivo.trim()
                    : 'Documento ' + status.toLowerCase() + ': ' + doc.tipoDocumento + '.',
                origem: 'Painel Administrativo'
            };
            const historicoAutomatico = r.statusAlteradoAutomaticamente ? {
                id: 'auto-status-' + Date.now(),
                dataHora: agora,
                usuario: 'Sistema',
                perfil: 'Sistema',
                acao: 'Status alterado',
                status: novoStatus,
                observacao: 'Documentação concluída. Todos os documentos obrigatórios foram aceitos ou dispensados. Aguardando documentos → Em atendimento.',
                origem: 'Painel Administrativo'
            } : null;
            setSelecionado(atual => ({ ...atual,
                statusSinistro: novoStatus,
                solicitacoesDocumentos: docs,
                documentosResumo: r.documentosResumo || atual.documentosResumo,
                pendenciaDocumental: r.pendenciaDocumental,
                historico: [...(atual.historico || []), historicoDocumento, ...(historicoAutomatico ? [historicoAutomatico] : [])]
            }));
            if (r.statusAlteradoAutomaticamente)
                setEdicao(atual => ({ ...atual, statusSinistro: novoStatus }));
            setLista(lista => lista.map(s => String(s.id) === String(selecionado.id) ? { ...s,
                statusSinistro: novoStatus,
                documentosResumo: r.documentosResumo || s.documentosResumo,
                pendenciaDocumental: r.pendenciaDocumental
            } : s));
            toast(r.statusAlteradoAutomaticamente
                ? 'Documento ' + (status === 'Dispensado' ? 'dispensado' : 'aceito') + '. Documentação concluída: sinistro voltou para Em atendimento.'
                : (status === 'Aceito' ? 'Documento aceito.' : status === 'Rejeitado' ? 'Documento devolvido para reenvio.' : 'Documento dispensado.'));
        }
        catch (e) {
            toast('Erro ao analisar documento: ' + e.message);
        }
        finally {
            setAnalisandoDocumento('');
        }
    };
    const salvarConfig = async () => { if (!config || !podeEditarConfig)
        return; setSalvandoConfig(true); try {
        const r = await ApiService.admSalvarConfiguracoesSinistros(config);
        setConfig(r.configuracao || config);
        toast('Configurações de sinistros salvas.');
    }
    catch (e) {
        toast('Erro ao salvar configurações: ' + e.message);
    }
    finally {
        setSalvandoConfig(false);
    } };
    const filtrados = lista.filter(s => { const texto = normalizar([s.numeroSinistro, s.placa, s.motoristaNome, s.municipio, s.tipoOcorrencia, s.tipoSinistro].join(' ')); const okTexto = !filtro.texto || texto.includes(normalizar(filtro.texto)); const encerrado = ['CONCLUIDO', 'CANCELADO'].includes(normalizarPerfil(s.statusSinistro)); const okStatus = filtro.status === 'TODOS' || (filtro.status === 'ABERTOS' && !encerrado) || normalizarPerfil(s.statusSinistro) === filtro.status; const okGrav = !filtro.gravidade || normalizarPerfil(s.gravidade) === filtro.gravidade; const okPeriodo = !filtro.competencia || String(s.dataHoraOcorrido || s.dataCriacao || s.created || '').slice(0, 7) === filtro.competencia; const okTipo = !filtro.tipoOcorrencia || normalizarPerfil(s.tipoOcorrencia) === normalizarPerfil(filtro.tipoOcorrencia); return okTexto && okStatus && okGrav && okPeriodo && okTipo; });
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("div", { className: "grow" },
                React.createElement("h2", null, "Sinistros"),
                React.createElement("div", { className: "muted" }, "Gest\u00E3o dos registros e par\u00E2metros operacionais do m\u00F3dulo.")),
            sub === 'gestao' && podeGestao && React.createElement("button", { className: "btn btn-s", onClick: carregar }, carregando ? 'Atualizando...' : 'Atualizar')),
        React.createElement("div", { className: "subtabs", style: { marginTop: 14 } },
            podeGestao && React.createElement("button", { className: 'subtab' + (sub === 'gestao' ? ' on' : ''), onClick: () => setSub('gestao') }, "Gest\u00E3o e tratamento"),
            podeConfig && React.createElement("button", { className: 'subtab' + (sub === 'config' ? ' on' : ''), onClick: () => setSub('config') }, "Configura\u00E7\u00F5es")),
        sub === 'gestao' && podeGestao && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "filtros-cadastro", style: { margin: 0 } },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-pesquisar" }, "Pesquisar"),
                        React.createElement("input", { id: "adm-sinistros-pesquisar", name: "adm-sinistros-pesquisar", autoComplete: "off", value: filtro.texto, onChange: e => setFiltro({ ...filtro, texto: e.target.value }), placeholder: "Protocolo, placa, motorista..." })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-status" }, "Status"),
                        React.createElement("select", { id: "adm-sinistros-status", name: "adm-sinistros-status", value: filtro.status, onChange: e => setFiltro({ ...filtro, status: e.target.value }) },
                            React.createElement("option", { value: "ABERTOS" }, "Em aberto"),
                            React.createElement("option", { value: "TODOS" }, "Todos"),
                            ['ABERTO', 'AGUARDANDO_ANALISE', 'EM_ATENDIMENTO', 'AGUARDANDO_DOCUMENTOS', 'ENCAMINHADO_SEGURADORA', 'AGUARDANDO_ORCAMENTO', 'EM_REPARO', 'AGUARDANDO_TERCEIRO', 'CONCLUIDO', 'CANCELADO'].map(x => React.createElement("option", { key: x, value: x }, x === 'ABERTO' ? 'Aberto (novo)' : (SINISTRO_STATUS_ROTULOS[x] || x.replaceAll('_', ' ')))))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-competencia" }, "Compet\u00EAncia"),
                        React.createElement("input", { id: "adm-sinistros-competencia", name: "adm-sinistros-competencia", autoComplete: "off", type: "month", value: filtro.competencia || '', onChange: e => setFiltro({ ...filtro, competencia: e.target.value }) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-tipo-de-ocorrencia" }, "Tipo de ocorr\u00EAncia"),
                        React.createElement("select", { id: "adm-sinistros-tipo-de-ocorrencia", name: "adm-sinistros-tipo-de-ocorrencia", value: filtro.tipoOcorrencia || '', onChange: e => setFiltro({ ...filtro, tipoOcorrencia: e.target.value }) },
                            React.createElement("option", { value: "" }, "Todos"),
                            ['Acidente', 'Pane', 'Avaria', 'Furto / Roubo / Vandalismo', 'Outro'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-gravidade" }, "Gravidade"),
                        React.createElement("select", { id: "adm-sinistros-gravidade", name: "adm-sinistros-gravidade", value: filtro.gravidade, onChange: e => setFiltro({ ...filtro, gravidade: e.target.value }) },
                            React.createElement("option", { value: "" }, "Todas"),
                            ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].map(x => React.createElement("option", { key: x }, x)))))),
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Registros filtrados"),
                    React.createElement("div", { className: "v" }, filtrados.length)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Com v\u00EDtima"),
                    React.createElement("div", { className: "v" }, filtrados.filter(s => s.possuiVitima).length)),
                React.createElement("div", { className: "card kpi" },
                    React.createElement("div", { className: "l" }, "Alta/cr\u00EDtica"),
                    React.createElement("div", { className: "v" }, filtrados.filter(s => ['ALTA', 'CRITICA'].includes(normalizarPerfil(s.gravidade))).length))),
            React.createElement("div", { className: "card", style: { overflowX: 'auto' } },
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null, "Protocolo"),
                            React.createElement("th", null, "Ocorrido"),
                            React.createElement("th", null, "Placa"),
                            React.createElement("th", null, "Motorista"),
                            React.createElement("th", null, "Ocorr\u00EAncia"),
                            React.createElement("th", null, "Gravidade"),
                            React.createElement("th", null, "Status"),
                            React.createElement("th", null))),
                    React.createElement("tbody", null, filtrados.map(s => React.createElement("tr", { key: s.id },
                        React.createElement("td", null,
                            React.createElement("b", null, s.numeroSinistro),
                            (s.documentosResumo?.pendentesEnvio || s.documentosResumo?.rejeitados) ? React.createElement("div", { className: "muted", style: { color: '#8A5200' } }, "A\u00E7\u00E3o do motorista pendente") : null),
                        React.createElement("td", null, dataBR(String(s.dataHoraOcorrido || '').slice(0, 10))),
                        React.createElement("td", null,
                            React.createElement("b", null, s.placa)),
                        React.createElement("td", null, s.motoristaNome),
                        React.createElement("td", null,
                            React.createElement("b", null, s.tipoOcorrencia || 'Outro'),
                            React.createElement("div", { className: "muted" }, s.tipoSinistro),
                            s.necessitaGuincho && React.createElement("div", { style: { marginTop: 4, fontWeight: 800, color: 'var(--erro)', fontSize: 12 } }, "\uD83D\uDEA8 GUINCHO NECESS\u00C1RIO")),
                        React.createElement("td", null,
                            React.createElement("span", { className: 'tag sinistro-gravidade-' + normalizarPerfil(s.gravidade) }, s.gravidade)),
                        React.createElement("td", null,
                            React.createElement(SinistroStatusTag, { s: s.statusSinistro })),
                        React.createElement("td", null,
                            React.createElement("button", { className: "btn btn-s btn-sm", disabled: carregandoDetalhe, onClick: () => abrir(s) }, carregandoDetalhe ? 'Abrindo...' : (pode(user, 'sinistros.gerenciar') ? 'Tratar' : 'Visualizar'))))))),
                !carregando && !filtrados.length && React.createElement("div", { className: "muted", style: { padding: 18, textAlign: 'center' } }, "Nenhum sinistro encontrado."))),
        sub === 'config' && podeConfig && React.createElement(React.Fragment, null, !config ? React.createElement("div", { className: "card" },
            React.createElement("div", { className: "muted" }, "Carregando configura\u00E7\u00F5es...")) : React.createElement("div", { className: "card" },
            React.createElement("div", { className: "row", style: { marginBottom: 14 } },
                React.createElement("div", { className: "grow" },
                    React.createElement("h3", null, "Configura\u00E7\u00F5es de sinistros"),
                    React.createElement("div", { className: "muted" }, "Par\u00E2metros lidos da lista Sinistros_Configuracoes.")),
                React.createElement("span", { className: 'tag ' + (podeEditarConfig ? 'tag-ok' : 'tag-neutro') }, podeEditarConfig ? 'Edição liberada' : 'Somente visualização')),
            React.createElement("div", { className: "form-grid" },
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-titulo" }, "T\u00EDtulo"),
                    React.createElement("input", { id: "adm-sinistros-titulo", name: "adm-sinistros-titulo", autoComplete: "off", disabled: !podeEditarConfig, value: config.titulo || '', onChange: e => setConfig({ ...config, titulo: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-status-2" }, "Status"),
                    React.createElement("select", { id: "adm-sinistros-status-2", name: "adm-sinistros-status-2", disabled: !podeEditarConfig, value: config.ativo ? 's' : 'n', onChange: e => setConfig({ ...config, ativo: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Ativo"),
                        React.createElement("option", { value: "n" }, "Inativo"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-e-mail-principal" }, "E-mail principal"),
                    React.createElement("input", { id: "adm-sinistros-e-mail-principal", name: "adm-sinistros-e-mail-principal", autoComplete: "off", disabled: !podeEditarConfig, value: config.emailPrincipal || '', onChange: e => setConfig({ ...config, emailPrincipal: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-e-mails-em-copia" }, "E-mails em c\u00F3pia"),
                    React.createElement("input", { id: "adm-sinistros-e-mails-em-copia", name: "adm-sinistros-e-mails-em-copia", autoComplete: "off", disabled: !podeEditarConfig, value: config.emailCopia || '', onChange: e => setConfig({ ...config, emailCopia: e.target.value }), placeholder: "Separar por ;" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-copia-oculta" }, "C\u00F3pia oculta"),
                    React.createElement("input", { id: "adm-sinistros-copia-oculta", name: "adm-sinistros-copia-oculta", autoComplete: "off", disabled: !podeEditarConfig, value: config.emailCopiaOculta || '', onChange: e => setConfig({ ...config, emailCopiaOculta: e.target.value }), placeholder: "Separar por ;" })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-assunto-do-e-mail" }, "Assunto do e-mail"),
                    React.createElement("input", { id: "adm-sinistros-assunto-do-e-mail", name: "adm-sinistros-assunto-do-e-mail", autoComplete: "off", disabled: !podeEditarConfig, value: config.assuntoEmail || '', onChange: e => setConfig({ ...config, assuntoEmail: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-contato-de-emergencia" }, "Contato de emerg\u00EAncia"),
                    React.createElement("input", { id: "adm-sinistros-contato-de-emergencia", name: "adm-sinistros-contato-de-emergencia", autoComplete: "off", disabled: !podeEditarConfig, value: config.nomeContatoEmergencia || '', onChange: e => setConfig({ ...config, nomeContatoEmergencia: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-telefone-de-emergencia" }, "Telefone de emerg\u00EAncia"),
                    React.createElement("input", { id: "adm-sinistros-telefone-de-emergencia", name: "adm-sinistros-telefone-de-emergencia", autoComplete: "off", disabled: !podeEditarConfig, value: config.telefoneEmergencia || '', onChange: e => setConfig({ ...config, telefoneEmergencia: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-revisao-do-procedimento" }, "Revis\u00E3o do procedimento"),
                    React.createElement("input", { id: "adm-sinistros-revisao-do-procedimento", name: "adm-sinistros-revisao-do-procedimento", autoComplete: "off", disabled: !podeEditarConfig, value: config.revisaoProcedimento || '', onChange: e => setConfig({ ...config, revisaoProcedimento: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-versao-do-modulo" }, "Vers\u00E3o do m\u00F3dulo"),
                    React.createElement("input", { id: "adm-sinistros-versao-do-modulo", name: "adm-sinistros-versao-do-modulo", autoComplete: "off", disabled: !podeEditarConfig, value: config.versaoModulo || '', onChange: e => setConfig({ ...config, versaoModulo: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-enviar-e-mail-automatico" }, "Enviar e-mail autom\u00E1tico?"),
                    React.createElement("select", { id: "adm-sinistros-enviar-e-mail-automatico", name: "adm-sinistros-enviar-e-mail-automatico", disabled: !podeEditarConfig, value: config.enviarEmailAutomatico ? 's' : 'n', onChange: e => setConfig({ ...config, enviarEmailAutomatico: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Sim"),
                        React.createElement("option", { value: "n" }, "N\u00E3o"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-permitir-reabertura" }, "Permitir reabertura?"),
                    React.createElement("select", { id: "adm-sinistros-permitir-reabertura", name: "adm-sinistros-permitir-reabertura", disabled: !podeEditarConfig, value: config.permiteReabrirSinistro ? 's' : 'n', onChange: e => setConfig({ ...config, permiteReabrirSinistro: e.target.value === 's' }) },
                        React.createElement("option", { value: "s" }, "Sim"),
                        React.createElement("option", { value: "n" }, "N\u00E3o"))),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-dias-para-reabertura" }, "Dias para reabertura"),
                    React.createElement("input", { id: "adm-sinistros-dias-para-reabertura", name: "adm-sinistros-dias-para-reabertura", autoComplete: "off", type: "number", min: "0", disabled: !podeEditarConfig, value: config.diasReabertura || 0, onChange: e => setConfig({ ...config, diasReabertura: Number(e.target.value) || 0 }) })),
                React.createElement("div", { style: { gridColumn: '1/-1' } },
                    React.createElement("label", { htmlFor: "adm-sinistros-procedimento" }, "Procedimento"),
                    React.createElement("textarea", { id: "adm-sinistros-procedimento", name: "adm-sinistros-procedimento", rows: "5", disabled: !podeEditarConfig, value: config.procedimento || '', onChange: e => setConfig({ ...config, procedimento: e.target.value }) })),
                React.createElement("div", null,
                    React.createElement("label", { htmlFor: "adm-sinistros-ultima-atualizacao" }, "\u00DAltima atualiza\u00E7\u00E3o"),
                    React.createElement("input", { id: "adm-sinistros-ultima-atualizacao", name: "adm-sinistros-ultima-atualizacao", autoComplete: "off", disabled: true, value: config.ultimaAtualizacao ? new Date(config.ultimaAtualizacao).toLocaleString('pt-BR') : '' }))),
            podeEditarConfig && React.createElement("button", { className: "btn btn-p", disabled: salvandoConfig, style: { marginTop: 14 }, onClick: salvarConfig }, salvandoConfig ? 'Salvando...' : 'Salvar configurações'))),
        selecionado && React.createElement(Modal, { large: true, titulo: selecionado.numeroSinistro + ' — ' + selecionado.placa, onClose: () => setSelecionado(null) },
            React.createElement("div", { className: "cards4" },
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Motorista"),
                    React.createElement("b", null, selecionado.motoristaNome),
                    React.createElement("div", { className: "muted" }, selecionado.motoristaTelefone || 'Sem telefone')),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Ocorr\u00EAncia"),
                    React.createElement("b", null, selecionado.tipoOcorrencia || 'Outro'),
                    React.createElement("div", { className: "muted" }, selecionado.tipoSinistro)),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Data/hora"),
                    React.createElement("b", null, dataHoraBRSinistro(selecionado.dataHoraOcorrido))),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Local"),
                    React.createElement("b", null, selecionado.localOcorrido),
                    React.createElement("div", { className: "muted" },
                        selecionado.municipio,
                        " / ",
                        selecionado.uf)),
                React.createElement("div", { className: "card" },
                    React.createElement("label", null, "Condi\u00E7\u00F5es"),
                    React.createElement("div", null, selecionado.possuiVitima ? '⚠ Possui vítima' : 'Sem vítima informada'),
                    React.createElement("div", null, selecionado.veiculoImobilizado ? 'Veículo imobilizado' : 'Veículo não imobilizado'),
                    selecionado.necessitaGuincho && React.createElement("div", { style: { marginTop: 5, fontWeight: 900, color: 'var(--erro)' } }, "\uD83D\uDEA8 GUINCHO NECESS\u00C1RIO"))),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("label", null, "Descri\u00E7\u00E3o"),
                React.createElement("div", { style: { whiteSpace: 'pre-wrap' } }, selecionado.descricaoOcorrido)),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Documentos e evid\u00EAncias do envio inicial"),
                (selecionado.documentos || []).length ? React.createElement(GaleriaArquivosSinistro, { arquivos: selecionado.documentos }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Nenhum arquivo enviado.")),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("div", { className: "row" },
                    React.createElement("h3", { className: "grow" }, "Solicita\u00E7\u00F5es documentais"),
                    React.createElement("span", { className: "muted" },
                        (selecionado.solicitacoesDocumentos || []).length,
                        " item(ns)")),
                (selecionado.solicitacoesDocumentos || []).length ? (selecionado.solicitacoesDocumentos || []).map(doc => { const chave = normalizarPerfil(doc.statusDocumento); return React.createElement("div", { className: 'sinistro-documento-item ' + (chave === 'REJEITADO' ? 'rejeitado' : chave === 'PENDENTE_DE_ENVIO' ? 'pendente' : chave === 'ENVIADO' ? 'enviado' : chave === 'ACEITO' ? 'aceito' : 'dispensado'), key: doc.id },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("b", null, doc.tipoDocumento),
                            doc.obrigatorio && React.createElement("span", { className: "muted" }, " \u00B7 obrigat\u00F3rio")),
                        React.createElement(DocumentoStatusTag, { s: doc.statusDocumento })),
                    doc.descricaoSolicitacao && React.createElement("div", { style: { marginTop: 6, whiteSpace: 'pre-wrap' } }, doc.descricaoSolicitacao),
                    doc.observacaoMotorista && React.createElement("div", { className: "muted", style: { marginTop: 6 } },
                        React.createElement("b", null, "Motorista:"),
                        " ",
                        doc.observacaoMotorista),
                    doc.motivoRejeicao && React.createElement("div", { className: "erro-box", style: { marginTop: 7 } },
                        React.createElement("b", null, "Motivo da rejei\u00E7\u00E3o:"),
                        " ",
                        doc.motivoRejeicao),
                    (doc.arquivos || []).length > 0 && React.createElement(GaleriaArquivosSinistro, { arquivos: doc.arquivos }),
                    pode(user, 'sinistros.gerenciar') && React.createElement("div", { className: "row", style: { marginTop: 8, flexWrap: 'wrap' } },
                        chave === 'ENVIADO' && React.createElement(React.Fragment, null,
                            React.createElement("button", { className: "btn btn-p btn-sm", disabled: analisandoDocumento === doc.id, onClick: () => analisarDocumento(doc, 'Aceito') }, "Aceitar"),
                            React.createElement("button", { className: "btn btn-d btn-sm", disabled: analisandoDocumento === doc.id, onClick: () => analisarDocumento(doc, 'Rejeitado') }, "Rejeitar / pedir reenvio")),
                        !['ACEITO', 'DISPENSADO'].includes(chave) && React.createElement("button", { className: "btn btn-g btn-sm", disabled: analisandoDocumento === doc.id, onClick: () => analisarDocumento(doc, 'Dispensado') }, "Dispensar"))); }) : React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Nenhum documento solicitado pela Log\u00EDstica.")),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("h3", null, "Hist\u00F3rico"),
                (selecionado.historico || []).map(h => { const p = historicoSinistroApresentacao(h); return React.createElement("div", { className: "linha-item", key: h.id },
                    React.createElement("span", { className: "grow" },
                        React.createElement("b", null, p.acao),
                        React.createElement("span", { className: "muted", style: { display: 'block' } },
                            dataHoraBRSinistro(h.dataHora),
                            " \u00B7 ",
                            h.usuario || h.perfil),
                        p.observacao && React.createElement("span", { style: { display: 'block', whiteSpace: 'pre-wrap' } }, p.observacao)),
                    React.createElement(HistoricoSinistroTag, { h: h })); })),
            React.createElement("div", { className: "card", style: { marginTop: 10 } },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-status-3" }, "Status"),
                        React.createElement("select", { id: "adm-sinistros-status-3", name: "adm-sinistros-status-3", disabled: !pode(user, 'sinistros.gerenciar'), value: edicao.statusSinistro, onChange: e => { setEdicao({ ...edicao, statusSinistro: e.target.value }); if (normalizarPerfil(e.target.value) !== 'AGUARDANDO_DOCUMENTOS')
                                setSolicitacoesNovas([]); } }, ['Aberto', 'Aguardando analise', 'Em atendimento', 'Aguardando documentos', 'Encaminhado seguradora', 'Aguardando orcamento', 'Em reparo', 'Aguardando terceiro', 'Concluido', 'Cancelado'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-sinistros-gravidade-2" }, "Gravidade"),
                        React.createElement("select", { id: "adm-sinistros-gravidade-2", name: "adm-sinistros-gravidade-2", disabled: !pode(user, 'sinistros.gerenciar'), value: edicao.gravidade, onChange: e => setEdicao({ ...edicao, gravidade: e.target.value }) }, ['Baixa', 'Media', 'Alta', 'Critica'].map(x => React.createElement("option", { key: x }, x)))),
                    React.createElement("div", { style: { gridColumn: '1/-1' } },
                        React.createElement("label", { htmlFor: "adm-sinistros-observacao-administrativa" }, "Observa\u00E7\u00E3o administrativa"),
                        React.createElement("textarea", { id: "adm-sinistros-observacao-administrativa", name: "adm-sinistros-observacao-administrativa", disabled: !pode(user, 'sinistros.gerenciar'), rows: "3", value: edicao.observacao, onChange: e => setEdicao({ ...edicao, observacao: e.target.value }), placeholder: "Registre a orienta\u00E7\u00E3o ou andamento relevante." }))),
                pode(user, 'sinistros.gerenciar') && normalizarPerfil(edicao.statusSinistro) === 'AGUARDANDO_DOCUMENTOS' && React.createElement("div", { style: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--linha)' } },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("h3", null, "Solicitar documentos ao motorista"),
                            React.createElement("div", { className: "muted" }, "Marque somente o que precisa ser enviado nesta etapa. Solicita\u00E7\u00F5es j\u00E1 existentes continuam v\u00E1lidas."))),
                    TIPOS_DOCUMENTOS_SINISTRO.map(tipo => { const atual = solicitacoesNovas.find(x => x.tipoDocumento === tipo); return React.createElement("div", { className: "sinistro-solicitacao-opcao", key: tipo },
                        React.createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, color: 'var(--tinta)', fontSize: 14, margin: 0 } },
                            React.createElement("input", { type: "checkbox", style: { width: 18, height: 18 }, checked: Boolean(atual), onChange: () => alternarSolicitacao(tipo) }),
                            React.createElement("b", null, tipo)),
                        atual && React.createElement(React.Fragment, null,
                            React.createElement("textarea", { rows: "2", style: { marginTop: 8 }, value: atual.descricaoSolicitacao || '', onChange: e => atualizarSolicitacao(tipo, 'descricaoSolicitacao', e.target.value), placeholder: tipo === 'Outro' ? 'Descreva exatamente o documento necessário.' : 'Orientação adicional (opcional): ex. foto frontal e lateral.' }),
                            React.createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, marginTop: 7 } },
                                React.createElement("input", { type: "checkbox", style: { width: 18, height: 18 }, checked: atual.obrigatorio !== false, onChange: e => atualizarSolicitacao(tipo, 'obrigatorio', e.target.checked) }),
                                "Obrigat\u00F3rio para encerrar a pend\u00EAncia documental"))); })),
                pode(user, 'sinistros.gerenciar') && React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 12 }, onClick: salvar }, "Salvar andamento"))));
}
