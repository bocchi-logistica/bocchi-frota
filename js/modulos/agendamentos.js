/* ================= AGENDAMENTOS: COMPONENTES ================= */
const AG_STATUS_LABEL = { AGENDADO: 'Agendado', AGUARDANDO_RETIRADA: 'Aguardando retirada', RETIRADA_ATRASADA: 'Retirada atrasada', EM_USO: 'Em uso', PENDENTE_FINALIZACAO: 'Pendente finalização', DEVOLUCAO_ATRASADA: 'Devolução atrasada', BLOQUEADO_NC: 'Bloqueado por NC', PENDENTE_ANALISE: 'Pendente análise', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' };
const fmtDataHora = v => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
function AgendaStatus({ status }) { return React.createElement("span", { className: 'agenda-status ' + status }, AG_STATUS_LABEL[status] || status); }
const AGENDA_CORES = [
    { b: '#1F7A55', f: '#E7F4ED', t: '#154C38' },
    { b: '#376FA6', f: '#EAF2FA', t: '#244E78' },
    { b: '#7A56A1', f: '#F1EBF7', t: '#51386E' },
    { b: '#C06A2B', f: '#FAEEE5', t: '#7D421A' },
    { b: '#A54657', f: '#F8E9EC', t: '#6F2D3A' },
    { b: '#547A27', f: '#EEF5E6', t: '#38521B' },
    { b: '#287C83', f: '#E7F4F5', t: '#1C555A' },
    { b: '#9B7622', f: '#F7F0DE', t: '#684F16' }
];
function corAgendaVeiculo(placa) {
    const chave = String(placa || 'SEM_PLACA').toUpperCase();
    let hash = 0;
    for (let i = 0; i < chave.length; i++)
        hash = ((hash * 31) + chave.charCodeAt(i)) >>> 0;
    return AGENDA_CORES[hash % AGENDA_CORES.length];
}
function CalendarioAgenda({ mes, eventos, onAbrir, onSelecionarDia, diaSelecionado = null }) {
    const ano = mes.getFullYear(), m = mes.getMonth(), primeiro = new Date(ano, m, 1), offset = (primeiro.getDay() + 6) % 7, inicio = new Date(ano, m, 1 - offset);
    const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isoSelecionado = diaSelecionado ? isoLocal(diaSelecionado) : '';
    const dias = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        const iso = isoLocal(d);
        dias.push({ d, iso, eventos: eventos.filter(e => String(e.saidaPrevista).slice(0, 10) === iso) });
    }
    return React.createElement("div", { className: "agenda-cal" },
        ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(x => React.createElement("div", { className: "agenda-semana", key: x }, x)),
        dias.map(({ d, iso, eventos: ev }) => React.createElement("div", { className: 'agenda-dia' + (d.getMonth() !== m ? ' off' : '') + (iso === isoSelecionado ? ' selecionado' : ''), key: iso, role: onSelecionarDia ? 'button' : undefined, onClick: () => onSelecionarDia && onSelecionarDia(new Date(d)) },
            React.createElement("b", null, d.getDate()),
            ev.slice(0, 3).map(e => { const c = corAgendaVeiculo(e.placa); return React.createElement("button", { className: "agenda-evento", style: { borderLeftColor: c.b, background: c.f, color: c.t }, key: e.id, onClick: clique => { clique.stopPropagation(); onAbrir(e); } },
                React.createElement("b", null,
                    fmtDataHora(e.saidaPrevista).slice(-5),
                    " \u00B7 ",
                    e.placa || 'Veículo'),
                React.createElement("br", null),
                e.destino); }),
            ev.length > 3 && React.createElement("div", { className: "muted" },
                "+",
                ev.length - 3))));
}
function FormAgendamento({ base, item, onClose, onSalvo, toast, admin = false, dataInicial = null }) {
    const agora = new Date(), pad = n => String(n).padStart(2, '0'), local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const dataSelecionada = (!item && dataInicial instanceof Date && Number.isFinite(dataInicial.getTime())) ? new Date(dataInicial.getFullYear(), dataInicial.getMonth(), dataInicial.getDate(), agora.getHours(), agora.getMinutes()) : agora;
    const dataBase = dataSelecionada < agora ? agora : dataSelecionada;
    const retorno = new Date(dataBase.getTime() + 2 * 3600000);
    const minimoSaida = local(agora);
    const [form, setForm] = useState({ solicitanteItemId: item?.solicitanteId || '', veiculoId: item?.veiculoId || '', motorista: item?.motorista || '', origem: item?.origem || '', destino: item?.destino || '', saidaPrevista: item?.saidaPrevista ? local(new Date(item.saidaPrevista)) : local(dataBase), retornoPrevisto: item?.retornoPrevisto ? local(new Date(item.retornoPrevisto)) : local(retorno), possuiPassageiros: item?.possuiPassageiros || false, quantidadePassageiros: item?.quantidadePassageiros || 0, observacao: item?.observacao || '', criadoManualmente: admin });
    const selecionarUsuario = id => { const u = (base.usuarios || []).find(x => String(x.id) === String(id)); setForm(f => ({ ...f, solicitanteItemId: id, motorista: u?.nome || f.motorista })); };
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => { if (admin && !form.solicitanteItemId) {
        toast('Selecione o usuário que utilizará o veículo.');
        return;
    } if (!form.veiculoId || !form.motorista.trim() || !form.origem.trim() || !form.destino.trim()) {
        toast('Informe veículo, motorista, origem e destino.');
        return;
    } const saidaLocal = new Date(form.saidaPrevista), retornoLocal = new Date(form.retornoPrevisto); if (!Number.isFinite(saidaLocal.getTime()) || !Number.isFinite(retornoLocal.getTime())) {
        toast('Informe datas e horários válidos.');
        return;
    } const agoraValidacao = new Date(); agoraValidacao.setSeconds(0, 0); if (saidaLocal < agoraValidacao) {
        toast('Não é permitido agendar veículo com saída em data ou horário anterior ao atual.');
        return;
    } if (retornoLocal <= saidaLocal) {
        toast('O retorno deve ser posterior à saída.');
        return;
    } const payload = { ...form, saidaPrevista: saidaLocal.toISOString(), retornoPrevisto: retornoLocal.toISOString() }; setSalvando(true); try {
        if (item)
            await ApiService.alterarAgendamento(item.id, payload);
        else
            await ApiService.criarAgendamento(payload);
        toast(item ? 'Agendamento alterado.' : 'Agendamento criado.');
        await onSalvo();
        onClose();
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setSalvando(false);
    } };
    return React.createElement(Modal, { titulo: item ? 'Alterar agendamento' : 'Novo agendamento', onClose: onClose, large: true },
        React.createElement("div", { className: "agenda-modal-grid" },
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-saida-prevista" }, "Sa\u00EDda prevista"),
                React.createElement("input", { id: "form-agendamento-saida-prevista", name: "form-agendamento-saida-prevista", autoComplete: "off", type: "datetime-local", min: minimoSaida, value: form.saidaPrevista, onChange: e => setForm({ ...form, saidaPrevista: e.target.value }) }),
                React.createElement("div", { className: "muted", style: { marginTop: 4 } }, "N\u00E3o \u00E9 permitido selecionar data/hor\u00E1rio anterior ao atual.")),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-retorno-previsto" }, "Retorno previsto"),
                React.createElement("input", { id: "form-agendamento-retorno-previsto", name: "form-agendamento-retorno-previsto", autoComplete: "off", type: "datetime-local", min: form.saidaPrevista || minimoSaida, value: form.retornoPrevisto, onChange: e => setForm({ ...form, retornoPrevisto: e.target.value }) })),
            admin && React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-usuario" }, "Usu\u00E1rio do agendamento"),
                React.createElement("select", { id: "form-agendamento-usuario", name: "form-agendamento-usuario", value: form.solicitanteItemId, onChange: e => selecionarUsuario(e.target.value) },
                    React.createElement("option", { value: "" }, "Selecionar usu\u00E1rio..."),
                    (base.usuarios || []).map(u => React.createElement("option", { key: u.id, value: u.id },
                        u.nome,
                        u.login ? ' — ' + u.login : ''))),
                React.createElement("div", { className: "muted", style: { marginTop: 4 } }, "Este usu\u00E1rio ver\u00E1 o agendamento no pr\u00F3prio acesso e far\u00E1 a retirada.")),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-veiculo-compartilhado" }, "Ve\u00EDculo compartilhado"),
                React.createElement("select", { id: "form-agendamento-veiculo-compartilhado", name: "form-agendamento-veiculo-compartilhado", value: form.veiculoId, onChange: e => setForm({ ...form, veiculoId: e.target.value }) },
                    React.createElement("option", { value: "" }, "Selecionar..."),
                    base.veiculos.map(v => React.createElement("option", { key: v.id, value: v.id },
                        v.placa,
                        " \u2014 ",
                        v.modelo || v.tipoModelo || 'Sem modelo')))),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-motorista" }, "Motorista"),
                React.createElement("input", { id: "form-agendamento-motorista", name: "form-agendamento-motorista", autoComplete: "off", value: form.motorista, onChange: e => setForm({ ...form, motorista: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-origem" }, "Origem"),
                React.createElement("input", { id: "form-agendamento-origem", name: "form-agendamento-origem", autoComplete: "off", value: form.origem, onChange: e => setForm({ ...form, origem: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-destino" }, "Destino"),
                React.createElement("input", { id: "form-agendamento-destino", name: "form-agendamento-destino", autoComplete: "off", value: form.destino, onChange: e => setForm({ ...form, destino: e.target.value }) })),
            React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-possui-passageiros" }, "Possui passageiros?"),
                React.createElement("select", { id: "form-agendamento-possui-passageiros", name: "form-agendamento-possui-passageiros", value: form.possuiPassageiros ? 'sim' : 'nao', onChange: e => setForm({ ...form, possuiPassageiros: e.target.value === 'sim', quantidadePassageiros: e.target.value === 'sim' ? form.quantidadePassageiros : 0 }) },
                    React.createElement("option", { value: "nao" }, "N\u00E3o"),
                    React.createElement("option", { value: "sim" }, "Sim"))),
            form.possuiPassageiros && React.createElement("div", null,
                React.createElement("label", { htmlFor: "form-agendamento-quantidade" }, "Quantidade"),
                React.createElement("input", { id: "form-agendamento-quantidade", name: "form-agendamento-quantidade", autoComplete: "off", type: "number", min: "1", value: form.quantidadePassageiros, onChange: e => setForm({ ...form, quantidadePassageiros: Number(e.target.value) }) })),
            React.createElement("div", { style: { gridColumn: '1/-1' } },
                React.createElement("label", { htmlFor: "form-agendamento-observacao" }, "Observa\u00E7\u00E3o"),
                React.createElement("textarea", { id: "form-agendamento-observacao", name: "form-agendamento-observacao", rows: "3", value: form.observacao, onChange: e => setForm({ ...form, observacao: e.target.value }) }))),
        React.createElement("div", { className: "agenda-acoes", style: { marginTop: 14 } },
            React.createElement("button", { className: "btn btn-g", onClick: onClose }, "Voltar"),
            React.createElement("button", { className: "btn btn-p", disabled: salvando, onClick: salvar }, salvando ? 'Salvando...' : 'Validar e salvar')));
}
function DetalheAgendamento({ item, admin, onClose, onAtualizar, toast, onAbrirChecklist, parametros = {} }) {
    const [acao, setAcao] = useState(''), [km, setKm] = useState(''), [motivo, setMotivo] = useState(''), [obs, setObs] = useState(''), [problema, setProblema] = useState(false), [salvando, setSalvando] = useState(false), [avisoRetirada, setAvisoRetirada] = useState(false);
    const kmReferencia = Number(item.kmMinimoRetirada || 0);
    const regularizacaoTerceiro = item.regularizacaoTerceiro === true;
    const somenteLeitura = !admin && item.meuAgendamento === false && !regularizacaoTerceiro;
    const janelaRetiradaMinutos = Math.max(0, Number(parametros?.janelaRetiradaMinutos || 0));
    const inicioPrevistoRetirada = new Date(item.saidaPrevista || 0);
    const liberaRetiradaEm = Number.isFinite(inicioPrevistoRetirada.getTime()) ? new Date(inicioPrevistoRetirada.getTime() - janelaRetiradaMinutos * 60000) : null;
    const retiradaLiberada = admin || !liberaRetiradaEm || Date.now() >= liberaRetiradaEm.getTime();
    const textoLiberacaoRetirada = liberaRetiradaEm ? liberaRetiradaEm.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const executar = async () => { if (acao === 'retirar' && kmReferencia && Number(km) < kmReferencia) {
        toast(`KM inicial não pode ser menor que o último KM final registrado da placa (${kmReferencia}).`);
        return;
    } setSalvando(true); try {
        let resposta = null;
        if (acao === 'cancelar')
            resposta = await ApiService.cancelarAgendamento(item.id, motivo, obs);
        if (acao === 'retirar')
            resposta = await ApiService.retirarAgendamento(item.id, { kmInicial: Number(km), possuiNC: problema, dataHora: new Date().toISOString(), origemOperacao: admin ? 'MONITORAMENTO_GESTAO' : 'APP' });
        if (acao === 'finalizar')
            resposta = await ApiService.finalizarAgendamento(item.id, { kmFinal: Number(km), possuiProblema: problema, dataHora: new Date().toISOString(), regularizacaoTerceiro });
        if (acao === 'corrigir')
            resposta = await ApiService.admCorrigirKmAgendamento(item.id, { kmInicial: Number(km), kmFinal: Number(obs || 0), motivo });
        toast(resposta?.mensagem || 'Ação concluída.');
        await onAtualizar();
        onClose();
        if (resposta?.abrirChecklist && onAbrirChecklist)
            onAbrirChecklist({ placa: resposta.placa || item.placa, agendamentoId: resposta.agendamentoId || item.id, etapa: resposta.etapa || acao, km: Number(resposta.km || km || 0), modoChecklist: resposta.modoChecklist || '', ultimoChecklist: resposta.ultimoChecklist || null, regularizacaoTerceiro: resposta.regularizacaoTerceiro === true || regularizacaoTerceiro });
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setSalvando(false);
    } };
    if (avisoRetirada && !admin)
        return React.createElement(Modal, { titulo: "Orienta\u00E7\u00F5es antes da retirada", onClose: () => setAvisoRetirada(false) },
            React.createElement("div", { className: "orientacao-retirada" },
                React.createElement("div", { className: "orientacao-alerta" },
                    React.createElement("b", null, "\uD83C\uDD98 ATEN\u00C7\u00C3O"),
                    React.createElement("span", null,
                        "Em caso de acidente ou sinistro, use imediatamente o m\u00F3dulo ",
                        React.createElement("strong", null, "Sinistro"),
                        ".")),
                React.createElement("div", { className: "orientacao-bloco" },
                    React.createElement("b", null, "\u26A0\uFE0F Diretrizes de condu\u00E7\u00E3o segura"),
                    React.createElement("div", { className: "orientacao-lista" },
                        React.createElement("span", null, "\u2022 Respeite a sinaliza\u00E7\u00E3o e o limite de velocidade da via."),
                        React.createElement("span", null,
                            "\u2022 ",
                            React.createElement("strong", null, "Nunca ultrapasse 120 km/h.")),
                        React.createElement("span", null, "\u2022 Ultrapasse somente onde for permitido e seguro."),
                        React.createElement("span", null,
                            "\u2022 ",
                            React.createElement("strong", null, "N\u00E3o use ou manuseie o celular dirigindo;"),
                            " pare em local seguro."),
                        React.createElement("span", null, "\u2022 Cinto de seguran\u00E7a obrigat\u00F3rio para todos os ocupantes."),
                        React.createElement("span", null, "\u2022 Conduza de forma preventiva e sem manobras de risco."))),
                React.createElement("div", { className: "orientacao-bloco orientacao-veiculo" },
                    React.createElement("b", null, "\uD83E\uDD33\uD83C\uDFFB Condi\u00E7\u00E3o do ve\u00EDculo"),
                    React.createElement("span", null,
                        "Registre qualquer avaria, n\u00E3o conformidade ou condi\u00E7\u00E3o anormal no ",
                        React.createElement("strong", null, "Checklist"),
                        ".")),
                React.createElement("button", { className: "btn btn-p orientacao-ciente", onClick: () => { setAvisoRetirada(false); setKm(String(kmReferencia || item.kmInicial || '')); setAcao('retirar'); } }, "Li e estou ciente \u2014 Continuar retirada")));
    const ncSemDetalhe = item.status === 'BLOQUEADO_NC' && !item.checklistNCProtocolo;
    const aguardando = ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(item.status), emUso = ['EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO'].includes(item.status);
    const agendamentoTerceiro = !admin && item.meuAgendamento === false;
    const previsto = fmtDataHora(item.saidaPrevista) + ' até ' + fmtDataHora(item.retornoPrevisto);
    const linhasDetalhe = [['Veículo', item.placa]];
    if (!agendamentoTerceiro) {
        linhasDetalhe.push(
            ['Motorista', item.motorista || item.solicitanteNome || '—'],
            ['Agendado para', item.solicitante || item.solicitanteNome || item.motorista || '—'],
            ['Criado por', (item.criadoPor || item.solicitante || '—') + (item.criadoManualmente ? ' · Manual ADM' : ' · Aplicativo')]
        );
    }
    linhasDetalhe.push(['Previsto', previsto]);
    if (!agendamentoTerceiro) {
        linhasDetalhe.push(
            ['Real', fmtDataHora(item.saidaReal) + ' até ' + fmtDataHora(item.retornoReal)],
            aguardando ? ['Último KM registrado', kmReferencia || '—'] : ['KM', `${item.kmInicial || '—'} → ${item.kmFinal || '—'}`]
        );
    }
    const titulo = agendamentoTerceiro
        ? 'Agendamento de outro motorista'
        : `${item.origem || 'Origem não informada'} → ${item.destino || 'Destino não informado'}`;
    return React.createElement(Modal, { titulo, onClose: onClose },
        React.createElement("div", { className: "row" },
            React.createElement(AgendaStatus, { status: item.status }),
            React.createElement("span", { className: "muted" }, item.codigo)),
        React.createElement("div", { className: "divider" }),
        linhasDetalhe.map(([l, v]) => React.createElement("div", { className: "linha-item", key: l },
            React.createElement("b", null, l),
            React.createElement("span", null, v))),
        !acao && React.createElement("div", { className: "agenda-acoes", style: { marginTop: 14 } },
            somenteLeitura && React.createElement("div", { className: "aviso-box", style: { width: '100%' } },
                "Somente consulta. Este agendamento pertence a ",
                item.motorista || 'outro motorista',
                "."),
            !somenteLeitura && !regularizacaoTerceiro && aguardando && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-d", onClick: () => setAcao('cancelar') }, "Cancelar agendamento"),
                React.createElement("button", { className: "btn btn-p", disabled: !retiradaLiberada, onClick: () => { if (!retiradaLiberada)
                        return; admin ? (setKm(String(kmReferencia || item.kmInicial || '')), setAcao('retirar')) : setAvisoRetirada(true); } }, admin ? 'Retirar manualmente' : retiradaLiberada ? 'Retirar veículo' : 'Retirada ainda não liberada'),
                !admin && !retiradaLiberada && React.createElement("div", { className: "muted", style: { width: '100%', fontSize: 12, textAlign: 'right' } },
                    "Dispon\u00EDvel a partir de ",
                    textoLiberacaoRetirada)),
            !somenteLeitura && ncSemDetalhe && onAbrirChecklist && React.createElement("button", {className:"btn btn-p",onClick:()=>{onClose();onAbrirChecklist({placa:item.placa,agendamentoId:item.id,etapa:"retirar",km:Number(item.kmInicial||0),modoChecklist:"OCORRENCIA"});}}, "Registrar anomalias no checklist"),
            regularizacaoTerceiro && emUso && React.createElement(React.Fragment, null,
                React.createElement("div", { className: "aviso-box", style: { width: '100%' } },
                    "Este ve\u00EDculo possui uma devolu\u00E7\u00E3o anterior ainda aberta por ",
                    item.motorista || 'outro motorista',
                    ". Informe a condi\u00E7\u00E3o atual do ve\u00EDculo para liberar sua retirada."),
                React.createElement("button", { className: "btn btn-p", onClick: () => { setKm(String(item.kmFinal || '')); setProblema(item.status === 'PENDENTE_FINALIZACAO'); setAcao('finalizar'); } }, "Regularizar devolu\u00E7\u00E3o anterior")),
            admin && item.status === 'EM_USO' && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM"),
                React.createElement("button", { className: "btn btn-d", onClick: () => setAcao('cancelar') }, "Cancelar agendamento"),
                React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, "Finalizar manualmente")),
            admin && item.status === 'DEVOLUCAO_ATRASADA' && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM"),
                React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, "Finalizar manualmente")),
            admin && item.status === 'PENDENTE_FINALIZACAO' && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM"),
                React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, "Concluir finaliza\u00E7\u00E3o")),
            !admin && !somenteLeitura && !regularizacaoTerceiro && emUso && React.createElement("button", { className: "btn btn-p", onClick: () => setAcao('finalizar') }, item.status === 'PENDENTE_FINALIZACAO' ? 'Concluir devolução' : 'Devolver veículo'),
            admin && item.status === 'FINALIZADO' && React.createElement("button", { className: "btn btn-s", onClick: () => { setKm(item.kmInicial || ''); setObs(item.kmFinal || ''); setAcao('corrigir'); } }, "Corrigir KM")),
        acao && React.createElement("div", { style: { marginTop: 14 } },
            acao === 'cancelar' ? React.createElement(React.Fragment, null,
                React.createElement("label", { htmlFor: "detalhe-agendamento-motivo-obrigatorio" }, "Motivo obrigat\u00F3rio"),
                React.createElement("select", { id: "detalhe-agendamento-motivo-obrigatorio", name: "detalhe-agendamento-motivo-obrigatorio", value: motivo, onChange: e => setMotivo(e.target.value) },
                    React.createElement("option", { value: "" }, "Selecionar..."),
                    ['VIAGEM_CANCELADA', 'ALTERACAO_PROGRAMACAO', 'VEICULO_NAO_NECESSARIO', 'MOTORISTA_INDISPONIVEL', 'VEICULO_INDISPONIVEL', 'ERRO_AGENDAMENTO', 'DUPLICIDADE', 'OUTRO'].map(x => React.createElement("option", { key: x }, x))),
                React.createElement("label", { style: { marginTop: 8 }, htmlFor: "detalhe-agendamento-observacao" }, "Observa\u00E7\u00E3o"),
                React.createElement("textarea", { id: "detalhe-agendamento-observacao", name: "detalhe-agendamento-observacao", value: obs, onChange: e => setObs(e.target.value) })) : React.createElement(React.Fragment, null,
                React.createElement("label", null, acao === 'finalizar' ? (regularizacaoTerceiro ? 'KM atual / final da devolução anterior' : 'KM final') : 'KM inicial'),
                React.createElement("input", { type: "number", min: acao === 'retirar' && kmReferencia ? kmReferencia : 1, value: km, onChange: e => setKm(e.target.value) }),
                acao === 'retirar' && kmReferencia > 0 && React.createElement("div", { className: "muted", style: { marginTop: 5 } },
                    "\u00DAltimo KM registrado: ",
                    kmReferencia,
                    ". Informe este valor ou um superior."),
                acao === 'corrigir' && React.createElement(React.Fragment, null,
                    React.createElement("label", { style: { marginTop: 8 }, htmlFor: "detalhe-agendamento-km-final-correto" }, "KM final correto"),
                    React.createElement("input", { id: "detalhe-agendamento-km-final-correto", name: "detalhe-agendamento-km-final-correto", autoComplete: "off", type: "number", value: obs, onChange: e => setObs(e.target.value) }),
                    React.createElement("label", { style: { marginTop: 8 }, htmlFor: "detalhe-agendamento-motivo" }, "Motivo"),
                    React.createElement("textarea", { id: "detalhe-agendamento-motivo", name: "detalhe-agendamento-motivo", value: motivo, onChange: e => setMotivo(e.target.value) })),
                acao !== 'corrigir' && React.createElement("div", { style: { marginTop: 8 } },
                    React.createElement("label", null, acao === 'retirar' ? 'Possui alguma NC?' : regularizacaoTerceiro ? 'Há alguma NC na condição atual?' : 'Houve problema?'),
                    regularizacaoTerceiro && item.status === 'PENDENTE_FINALIZACAO' ? React.createElement("div", { className: "aviso-box" }, "Existe uma ocorr\u00EAncia pendente nesta devolu\u00E7\u00E3o. O registro da NC \u00E9 obrigat\u00F3rio para concluir.") : React.createElement("select", { value: problema ? 'sim' : 'nao', onChange: e => setProblema(e.target.value === 'sim') },
                        React.createElement("option", { value: "nao" }, "N\u00E3o"),
                        React.createElement("option", { value: "sim" }, "Sim")))),
            React.createElement("div", { className: "agenda-acoes", style: { marginTop: 12 } },
                React.createElement("button", { className: "btn btn-g", onClick: () => setAcao('') }, "Voltar"),
                React.createElement("button", { className: "btn btn-p", disabled: salvando || acao === 'cancelar' && !motivo, onClick: executar }, "Confirmar"))));
}
function TelaAgendamento({ user, toast, onAbrirChecklist }) {
    const [base, setBase] = useState({ veiculos: [], agendamentos: [], parametros: {} }), [carregando, setCarregando] = useState(true), [mes, setMes] = useState(new Date()), [form, setForm] = useState(false), [detalhe, setDetalhe] = useState(null), [visual, setVisual] = useState('todos'), [veiculoFiltro, setVeiculoFiltro] = useState(''), [modoVisao, setModoVisao] = useState('mes'), [diaSelecionado, setDiaSelecionado] = useState(new Date()), [filtroRapido, setFiltroRapido] = useState('proximo');
    const leituraAgenda = React.useRef(0);
    const carregar = async (silencioso = false) => {
        const leitura = ++leituraAgenda.current;
        if (!silencioso) setCarregando(true);
        try {
        const r = await ApiService.obterAgendamentos();
        if (leitura !== leituraAgenda.current) return;
        setBase({ veiculos: r.veiculos || [], agendamentos: r.agendamentos || [], parametros: r.parametros || {} });
    }
    catch (e) {
        if (!silencioso && leitura === leituraAgenda.current) toast(e.message);
    }
    finally {
        if (leitura === leituraAgenda.current) setCarregando(false);
    } };
    useEffect(() => {
        carregar();
        return () => { leituraAgenda.current++; };
    }, []);
    useAtualizacaoPortal(['agendamentos'], () => carregar(true));
    const norm = v => String(v || '').trim().toLocaleLowerCase('pt-BR');
    // Agenda compartilhada visível; as ações continuam restritas ao responsável.
    const meus = base.agendamentos.filter(a => a.meuAgendamento === true);
    const eventos = base.agendamentos.filter(a => (visual === 'todos' || a.meuAgendamento === true) && (!veiculoFiltro || String(a.placa) === veiculoFiltro));
    const agora = new Date();
    const janelaRetirada = Number(base.parametros?.janelaRetiradaMinutos || 30);
    const ativos = meus.filter(a => !['FINALIZADO', 'CANCELADO'].includes(a.status));
    const emUso = ativos.filter(a => ['EM_USO', 'DEVOLUCAO_ATRASADA'].includes(a.status)).sort((a, b) => new Date(a.retornoPrevisto || 0) - new Date(b.retornoPrevisto || 0));
    const pendencias = ativos.filter(a => a.status === 'PENDENTE_FINALIZACAO').sort((a, b) => new Date(a.retornoPrevisto || 0) - new Date(b.retornoPrevisto || 0));
    const agendados = ativos.filter(a => ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(a.status)).sort((a, b) => new Date(a.saidaPrevista || 0) - new Date(b.saidaPrevista || 0));
    // Prioridade operacional: qualquer agendamento cuja janela de retirada já abriu
    // vem antes de um agendamento futuro, mesmo que RetornoPrevisto esteja vazio.
    const liberadosRetirada = agendados.filter(a => {
        const inicio = new Date(a.saidaPrevista || 0);
        return Number.isFinite(inicio.getTime()) && agora >= new Date(inicio.getTime() - janelaRetirada * 60000);
    });
    const agendadosFuturos = agendados.filter(a => {
        const inicio = new Date(a.saidaPrevista || 0);
        return Number.isFinite(inicio.getTime()) && inicio > agora;
    });
    const mesmoVeiculoTela = (a, b) => {
        if (a?.veiculoId && b?.veiculoId && String(a.veiculoId) === String(b.veiculoId))
            return true;
        const pa = String(a?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(), pb = String(b?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return Boolean(pa && pb && pa === pb);
    };
    const retiradaPronta = liberadosRetirada[0] || null;
    const bloqueadorRetirada = retiradaPronta ? base.agendamentos
        .filter(a => a.meuAgendamento !== true && String(a.id) !== String(retiradaPronta.id) && mesmoVeiculoTela(a, retiradaPronta) && ['EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO'].includes(a.status))
        .sort((a, b) => new Date(b.saidaReal || b.saidaPrevista || 0) - new Date(a.saidaReal || a.saidaPrevista || 0))[0] || null : null;
    const proxima = pendencias[0] || emUso[0] || (bloqueadorRetirada ? { ...bloqueadorRetirada, regularizacaoTerceiro: true, agendamentoSeguinteId: retiradaPronta.id } : retiradaPronta) || agendadosFuturos[0] || null;
    const configAcao = proxima ? (proxima.regularizacaoTerceiro ? { titulo: 'Regularizar devolução anterior', sub: `${proxima.motorista || 'Outro motorista'} ainda não concluiu a devolução deste veículo. Regularize a condição atual antes da sua retirada.`, botao: 'Regularizar devolução' } :
        proxima.status === 'PENDENTE_FINALIZACAO' ? { titulo: 'Finalizar pendência', sub: 'A devolução possui uma pendência e precisa ser concluída.', botao: 'Concluir devolução' } :
            ['EM_USO', 'DEVOLUCAO_ATRASADA'].includes(proxima.status) ? { titulo: 'Devolver veículo', sub: proxima.status === 'DEVOLUCAO_ATRASADA' ? 'O horário previsto de retorno já passou.' : 'A utilização está aberta e precisa ser encerrada ao retornar.', botao: 'Devolver veículo' } :
                ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(proxima.status) && agora >= new Date(new Date(proxima.saidaPrevista).getTime() - janelaRetirada * 60000) ? { titulo: 'Retirar veículo', sub: `Seu agendamento começa às ${fmtDataHora(proxima.saidaPrevista).slice(-5)}.`, botao: 'Retirar veículo' } :
                    { titulo: 'Próximo agendamento', sub: `Previsto para ${fmtDataHora(proxima.saidaPrevista)}. A retirada será liberada dentro da janela configurada.`, botao: 'Ver agendamento' }) : null;
    const irHoje = () => { const h = new Date(); setMes(h); setDiaSelecionado(h); };
    const isoDia = d => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
    const eventosDia = eventos.filter(a => String(a.saidaPrevista || '').slice(0, 10) === isoDia(diaSelecionado));
    const moverDia = delta => { const d = new Date(diaSelecionado); d.setDate(d.getDate() + delta); setDiaSelecionado(d); setMes(d); };
    const mesmaPlacaLocal = (a, b) => {
        if (a?.veiculoId && b?.veiculoId && String(a.veiculoId) === String(b.veiculoId))
            return true;
        const pa = String(a?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const pb = String(b?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return Boolean(pa && pb && pa === pb);
    };
    const detalheAtual = detalhe ? (() => {
        const refs = base.agendamentos
            .filter(a => String(a.id) !== String(detalhe.id) && Number(a.kmFinal) > 0 && (a.status === 'FINALIZADO' || a.retornoReal) && mesmaPlacaLocal(a, detalhe))
            .map(a => Number(a.kmFinal) || 0);
        const local = refs.length ? Math.max(...refs) : 0;
        return { ...detalhe, kmMinimoRetirada: Math.max(Number(detalhe.kmMinimoRetirada || 0), local) };
    })() : null;
    return React.createElement(React.Fragment, null,
        carregando ? React.createElement("div", { className: "card muted" }, "Carregando agenda...") : React.createElement(React.Fragment, null,
            React.createElement("div", { className: "agenda-top" },
                React.createElement("div", { className: "agenda-filtros" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-agendamento-veiculo" }, "Ve\u00EDculo"),
                        React.createElement("select", { id: "tela-agendamento-veiculo", name: "tela-agendamento-veiculo", value: veiculoFiltro, onChange: e => setVeiculoFiltro(e.target.value) },
                            React.createElement("option", { value: "" }, "Todos os ve\u00EDculos"),
                            base.veiculos.map(v => React.createElement("option", { key: v.id, value: v.placa },
                                v.placa,
                                " \u2014 ",
                                v.modelo || v.tipoModelo || 'Sem modelo')))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "tela-agendamento-visualizar" }, "Visualizar"),
                        React.createElement("select", { id: "tela-agendamento-visualizar", name: "tela-agendamento-visualizar", value: visual, onChange: e => setVisual(e.target.value) },
                            React.createElement("option", { value: "todos" }, "Todos os agendamentos"),
                            React.createElement("option", { value: "meus" }, "Meus agendamentos")))),
                React.createElement("div", { className: "agenda-top-nav" },
                    React.createElement("button", { className: "btn btn-sm", style: { color: '#fff' }, onClick: () => { if (modoVisao === 'dia')
                            moverDia(-1);
                        else
                            setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1)); } }, "\u2039"),
                    React.createElement("div", { className: "agenda-top-mes" }, modoVisao === 'dia' ? diaSelecionado.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : (() => { const m = mes.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); return m.charAt(0).toUpperCase() + m.slice(1) + '/' + String(mes.getFullYear()).slice(-2); })()),
                    React.createElement("button", { className: "btn btn-sm", style: { color: '#fff' }, onClick: () => { if (modoVisao === 'dia')
                            moverDia(1);
                        else
                            setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)); } }, "\u203A"),
                    React.createElement("div", { className: "agenda-top-spacer" }),
                    React.createElement("button", { className: "btn btn-sm", style: { color: '#fff', border: '1px solid rgba(255,255,255,.35)' }, onClick: irHoje }, "Hoje"),
                    React.createElement("div", { className: "agenda-view-toggle" },
                        React.createElement("button", { className: modoVisao === 'mes' ? 'on' : '', onClick: () => setModoVisao('mes') }, "M\u00EAs"),
                        React.createElement("button", { className: modoVisao === 'dia' ? 'on' : '', onClick: () => setModoVisao('dia') }, "Dia")))),
            configAcao ? React.createElement("div", { className: "agenda-proxima card" },
                React.createElement("div", { className: "kicker" },
                    React.createElement("span", null, "\u25CF"),
                    " Pr\u00F3xima a\u00E7\u00E3o"),
                React.createElement("div", { className: "titulo" }, configAcao.titulo),
                React.createElement("div", { className: "muted", style: { fontSize: 14 } }, configAcao.sub),
                React.createElement("div", { className: "agenda-proxima-grid" },
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Ve\u00EDculo"),
                        proxima.placa || '—'),
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Trajeto"),
                        proxima.origem,
                        " \u2192 ",
                        proxima.destino),
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Hor\u00E1rio"),
                        fmtDataHora(proxima.saidaPrevista).slice(-5),
                        " \u00E0s ",
                        fmtDataHora(proxima.retornoPrevisto).slice(-5)),
                    React.createElement("div", { className: "agenda-proxima-info" },
                        React.createElement("b", null, "Status"),
                        AG_STATUS_LABEL[proxima.status] || proxima.status)),
                React.createElement("button", { className: "btn btn-p", style: { width: '100%', marginTop: 13, fontSize: 16 }, onClick: () => setDetalhe(proxima) }, configAcao.botao)) : React.createElement("div", { className: "card", style: { margin: '14px 0' } },
                React.createElement("b", null, "Nenhuma a\u00E7\u00E3o dispon\u00EDvel agora"),
                React.createElement("div", { className: "muted" }, "Voc\u00EA n\u00E3o possui retirada, devolu\u00E7\u00E3o ou finaliza\u00E7\u00E3o pendente neste momento.")),
            modoVisao === 'mes' ? React.createElement(CalendarioAgenda, { mes: mes, eventos: eventos, onAbrir: setDetalhe, diaSelecionado: diaSelecionado, onSelecionarDia: d => { setDiaSelecionado(d); setMes(d); setModoVisao('dia'); } }) : React.createElement("div", { className: "agenda-dia-lista" },
                React.createElement("div", { className: "card row" },
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => moverDia(-1) }, "\u2039"),
                    React.createElement("b", { className: "grow", style: { textAlign: 'center' } }, diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })),
                    React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => moverDia(1) }, "\u203A")),
                eventosDia.length ? eventosDia.sort((a, b) => new Date(a.saidaPrevista) - new Date(b.saidaPrevista)).map(e => { const c = corAgendaVeiculo(e.placa); return React.createElement("button", { key: e.id, className: "agenda-dia-card", style: { borderLeftColor: c.b }, onClick: () => setDetalhe(e) },
                    React.createElement("div", { className: "row" },
                        React.createElement("div", { className: "grow" },
                            React.createElement("b", null,
                                "Sa\u00EDda: ",
                                fmtDataHora(e.saidaPrevista).slice(-5),
                                " \u00B7 Retorno: ",
                                fmtDataHora(e.retornoPrevisto).slice(-5),
                                " \u00B7 ",
                                e.placa),
                            React.createElement("div", { className: "muted" },
                                e.origem,
                                " \u2192 ",
                                e.destino)),
                        React.createElement(AgendaStatus, { status: e.status }))); }) : React.createElement("div", { className: "card muted" }, "Nenhum agendamento neste dia.")),
            React.createElement("button", { className: "btn btn-p agenda-fab", onClick: () => setForm(true) }, "+")),
        form && React.createElement(FormAgendamento, { base: base, dataInicial: diaSelecionado, onClose: () => setForm(false), onSalvo: carregar, toast: toast }),
        " ",
        detalheAtual && React.createElement(DetalheAgendamento, { item: detalheAtual, parametros: base.parametros, onClose: () => setDetalhe(null), onAtualizar: carregar, toast: toast, onAbrirChecklist: onAbrirChecklist }));
}
function AdmAgendamentos({ user, toast }) {
    const podeAgenda = pode(user, 'agendamentos.agenda'), podeMonitor = pode(user, 'agendamentos.monitoramento'), podeRel = pode(user, 'agendamentos.relatorio'), podeParam = pode(user, 'agendamentos.parametros');
    const inicial = podeAgenda ? 'agenda' : podeMonitor ? 'monitor' : podeRel ? 'relatorio' : 'parametros';
    const [sub, setSub] = useState(inicial), [base, setBase] = useState({ veiculos: [], usuarios: [], agendamentos: [], parametros: {}, diagnosticoVeiculos: {} }), [carregando, setCarregando] = useState(true), [mes, setMes] = useState(new Date()), [detalhe, setDetalhe] = useState(null), [form, setForm] = useState(false), [monitorFiltro, setMonitorFiltro] = useState('AGUARDANDO_RETIRADA'), [fStatus, setFStatus] = useState('TODOS'), [fPlacaRel, setFPlacaRel] = useState('TODAS'), [fDataIniRel, setFDataIniRel] = useState(''), [fDataFimRel, setFDataFimRel] = useState(''), [paramForm, setParamForm] = useState({}), [salvandoParam, setSalvandoParam] = useState(false), [modoVisao, setModoVisao] = useState('mes'), [diaSelecionado, setDiaSelecionado] = useState(new Date());
    const leituraAgenda = React.useRef(0);
    const carregar = async (silencioso = false) => {
        const leitura = ++leituraAgenda.current;
        if (!silencioso) setCarregando(true);
        try {
        const r = await ApiService.admAgendamentos();
        if (leitura !== leituraAgenda.current) return;
        const dados = { veiculos: r.veiculos || [], usuarios: r.usuarios || [], agendamentos: r.agendamentos || [], parametros: r.parametros || {}, diagnosticoVeiculos: r.diagnosticoVeiculos || {} };
        setBase(dados);
        if (!silencioso) setParamForm(dados.parametros);
    }
    catch (e) {
        if (!silencioso && leitura === leituraAgenda.current) toast(e.message);
    }
    finally {
        if (leitura === leituraAgenda.current) setCarregando(false);
    } };
    useEffect(() => {
        carregar();
        return () => { leituraAgenda.current++; };
    }, []);
    useAtualizacaoPortal(['agendamentos'], () => carregar(true));
    const placasRel = [...new Set(base.agendamentos.map(a => a.placa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const filtrados = base.agendamentos.filter(a => {
        if (fStatus !== 'TODOS' && a.status !== fStatus)
            return false;
        if (fPlacaRel !== 'TODAS' && a.placa !== fPlacaRel)
            return false;
        const data = String(a.saidaPrevista || '').slice(0, 10);
        if (fDataIniRel && data < fDataIniRel)
            return false;
        if (fDataFimRel && data > fDataFimRel)
            return false;
        return true;
    });
    const exportar = () => { const linhas = filtrados.map(a => ({ Codigo: a.codigo, Placa: a.placa, AgendadoPara: a.solicitante || '', CriadoPor: a.criadoPor || '', OrigemAgendamento: a.criadoManualmente ? 'Manual ADM' : 'Aplicativo', Modelo: a.modelo || '', Motorista: a.motorista, Origem: a.origem, Destino: a.destino, SaidaPrevista: a.saidaPrevista, RetornoPrevisto: a.retornoPrevisto, SaidaReal: a.saidaReal, RetornoReal: a.retornoReal, KmInicial: a.kmInicial, KmFinal: a.kmFinal, KmRodado: a.kmRodado, Status: AG_STATUS_LABEL[a.status] || a.status, MotivoCancelamento: a.motivoCancelamento })); const ws = XLSX.utils.json_to_sheet(linhas), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Agendamentos'); XLSX.writeFile(wb, 'Relatorio_Agendamentos.xlsx'); };
    const alterarParam = (campo, valor) => setParamForm(p => ({ ...p, [campo]: valor }));
    const salvarParametros = async () => { setSalvandoParam(true); try {
        const r = await ApiService.salvarParametrosAgendamento(paramForm);
        toast(r.mensagem || 'Parâmetros atualizados.');
        await carregar();
    }
    catch (e) {
        toast(e.message);
    }
    finally {
        setSalvandoParam(false);
    } };
    const SimNao = ({ campo }) => React.createElement("select", { value: paramForm[campo] ? 'sim' : 'nao', onChange: e => alterarParam(campo, e.target.value === 'sim') },
        React.createElement("option", { value: "sim" }, "Sim"),
        React.createElement("option", { value: "nao" }, "N\u00E3o"));
    const isoDiaAdm = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const eventosDiaAdm = base.agendamentos.filter(a => String(a.saidaPrevista || '').slice(0, 10) === isoDiaAdm(diaSelecionado)).sort((a, b) => new Date(a.saidaPrevista) - new Date(b.saidaPrevista));
    const moverDiaAdm = delta => { const d = new Date(diaSelecionado); d.setDate(d.getDate() + delta); setDiaSelecionado(d); setMes(d); };
    const irHojeAdm = () => { const h = new Date(); setMes(h); setDiaSelecionado(h); };
    const selecionarDiaAdm = d => { setDiaSelecionado(d); setMes(d); setModoVisao('dia'); };
    const ConteudoAgendaGeral = () => React.createElement(React.Fragment, null,
        React.createElement("div", { className: "row", style: { flexWrap: 'wrap' } },
            React.createElement("div", { className: "grow" },
                React.createElement("h2", null, "Agenda geral"),
                React.createElement("div", { className: "muted" }, "Somente ve\u00EDculos ativos da Frota Leve marcados como uso compartilhado."),
                base.veiculos.length === 0 && React.createElement("div", { className: "aviso-box", style: { marginTop: 8 } },
                    "Nenhuma placa dispon\u00EDvel. Cadastro: ",
                    base.diagnosticoVeiculos.totalCadastro || 0,
                    "; ativos: ",
                    base.diagnosticoVeiculos.totalAtivos || 0,
                    "; Frota Leve: ",
                    base.diagnosticoVeiculos.totalFrotaLeve || 0,
                    "; compartilhados: ",
                    base.diagnosticoVeiculos.totalCompartilhados || 0,
                    ". Regra: ",
                    base.diagnosticoVeiculos.regra || 'ATIVO + FROTA LEVE + USO COMPARTILHADO',
                    ".")),
            React.createElement("button", { className: "btn btn-p", onClick: () => setForm(true) }, "+ Novo agendamento")),
        React.createElement("div", { className: "row card", style: { flexWrap: 'wrap' } },
            React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { if (modoVisao === 'dia')
                    moverDiaAdm(-1);
                else
                    setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1)); } }, "\u2039"),
            React.createElement("h2", { className: "grow" }, modoVisao === 'dia' ? diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })),
            React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => { if (modoVisao === 'dia')
                    moverDiaAdm(1);
                else
                    setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)); } }, "\u203A"),
            React.createElement("button", { className: "btn btn-s btn-sm", onClick: irHojeAdm }, "Hoje"),
            React.createElement("div", { className: "subtabs" },
                React.createElement("button", { className: 'subtab' + (modoVisao === 'mes' ? ' on' : ''), onClick: () => setModoVisao('mes') }, "M\u00EAs"),
                React.createElement("button", { className: 'subtab' + (modoVisao === 'dia' ? ' on' : ''), onClick: () => setModoVisao('dia') }, "Dia"))),
        modoVisao === 'mes'
            ? React.createElement(CalendarioAgenda, { mes: mes, eventos: base.agendamentos, onAbrir: setDetalhe, diaSelecionado: diaSelecionado, onSelecionarDia: selecionarDiaAdm })
            : React.createElement("div", { className: "agenda-dia-lista" }, eventosDiaAdm.length ? eventosDiaAdm.map(e => { const c = corAgendaVeiculo(e.placa); return React.createElement("button", { key: e.id, className: "agenda-dia-card", style: { borderLeftColor: c.b }, onClick: () => setDetalhe(e) },
                React.createElement("div", { className: "row" },
                    React.createElement("div", { className: "grow" },
                        React.createElement("b", null,
                            "Sa\u00EDda: ",
                            fmtDataHora(e.saidaPrevista).slice(-5),
                            " \u00B7 Retorno: ",
                            fmtDataHora(e.retornoPrevisto).slice(-5),
                            " \u00B7 ",
                            e.placa),
                        React.createElement("div", { className: "muted" },
                            e.motorista,
                            " \u00B7 ",
                            e.origem,
                            " \u2192 ",
                            e.destino)),
                    React.createElement(AgendaStatus, { status: e.status }))); }) : React.createElement("div", { className: "card muted" }, "Nenhum agendamento neste dia.")));
    const retiradaAtrasada = a => ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(a.status) && !a.saidaReal && Number.isFinite(new Date(a.saidaPrevista).getTime()) && new Date(a.saidaPrevista).getTime() < Date.now();
    const monitorStatus = ['AGUARDANDO_RETIRADA', 'RETIRADA_ATRASADA', 'EM_USO', 'DEVOLUCAO_ATRASADA', 'PENDENTE_FINALIZACAO', 'FINALIZADO'];
    const monitorMatch = (a, s) => s === 'RETIRADA_ATRASADA' ? retiradaAtrasada(a) : s === 'AGUARDANDO_RETIRADA' ? ['AGENDADO', 'AGUARDANDO_RETIRADA'].includes(a.status) : a.status === s;
    const monitorLista = base.agendamentos.filter(a => monitorMatch(a, monitorFiltro));
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "subtabs" },
            podeAgenda && React.createElement("button", { className: 'subtab' + (sub === 'agenda' ? ' on' : ''), onClick: () => setSub('agenda') }, "Agenda geral"),
            podeMonitor && React.createElement("button", { className: 'subtab' + (sub === 'monitor' ? ' on' : ''), onClick: () => setSub('monitor') }, "Monitoramento e gest\u00E3o"),
            podeRel && React.createElement("button", { className: 'subtab' + (sub === 'relatorio' ? ' on' : ''), onClick: () => setSub('relatorio') }, "Relat\u00F3rio"),
            podeParam && React.createElement("button", { className: 'subtab' + (sub === 'parametros' ? ' on' : ''), onClick: () => setSub('parametros') }, "Par\u00E2metros")),
        carregando ? React.createElement("div", { className: "card muted" }, "Carregando agendamentos...") : sub === 'agenda' ? React.createElement(ConteudoAgendaGeral, null) : sub === 'monitor' ? React.createElement(React.Fragment, null,
            React.createElement("div", { className: "agenda-kpis" }, monitorStatus.map(s => { const total = base.agendamentos.filter(a => monitorMatch(a, s)).length; return React.createElement("button", { type: "button", className: "agenda-kpi", key: s, onClick: () => setMonitorFiltro(s), style: { textAlign: 'left', outline: monitorFiltro === s ? '2px solid var(--folha)' : 'none', cursor: 'pointer' } },
                React.createElement("b", null, total),
                React.createElement("span", null, AG_STATUS_LABEL[s])); })),
            React.createElement("div", { className: "card" }, monitorLista.length === 0 ? React.createElement("div", { className: "muted" }, "Nenhum agendamento neste status.") : monitorLista.map(a => React.createElement("div", { className: "agenda-lista-item row", key: a.id },
                React.createElement("div", { className: "grow" },
                    React.createElement("b", null,
                        a.placa,
                        " \u00B7 ",
                        a.origem,
                        " \u2192 ",
                        a.destino),
                    React.createElement("div", { className: "muted" },
                        a.motorista,
                        " \u00B7 Sa\u00EDda prevista: ",
                        fmtDataHora(a.saidaPrevista)),
                    React.createElement("div", { className: "muted" },
                        "Devolu\u00E7\u00E3o prevista: ",
                        fmtDataHora(a.retornoPrevisto),
                        a.retornoReal ? React.createElement(React.Fragment, null,
                            " \u00B7 Devolu\u00E7\u00E3o real: ",
                            fmtDataHora(a.retornoReal)) : a.status === 'DEVOLUCAO_ATRASADA' ? React.createElement("span", { style: { color: 'var(--erro)', fontWeight: 700 } }, " \u00B7 Atrasada") : null)),
                retiradaAtrasada(a) ? React.createElement("span", { className: "tag tag-neg" }, "Retirada atrasada") : React.createElement(AgendaStatus, { status: a.status }),
                React.createElement("button", { className: "btn btn-g btn-sm", onClick: () => setDetalhe(a) }, "Abrir"))))) : sub === 'relatorio' ? React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("h2", null, "Relat\u00F3rio de agendamentos")),
                React.createElement("button", { className: "btn btn-p", onClick: exportar }, "Exportar Excel")),
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-periodo-de" }, "Per\u00EDodo de"),
                        React.createElement("input", { id: "adm-agendamentos-periodo-de", name: "adm-agendamentos-periodo-de", autoComplete: "off", type: "date", value: fDataIniRel, onChange: e => setFDataIniRel(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-ate" }, "At\u00E9"),
                        React.createElement("input", { id: "adm-agendamentos-ate", name: "adm-agendamentos-ate", autoComplete: "off", type: "date", value: fDataFimRel, onChange: e => setFDataFimRel(e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-veiculo" }, "Ve\u00EDculo"),
                        React.createElement("select", { id: "adm-agendamentos-veiculo", name: "adm-agendamentos-veiculo", value: fPlacaRel, onChange: e => setFPlacaRel(e.target.value) },
                            React.createElement("option", { value: "TODAS" }, "Todas as placas"),
                            placasRel.map(p => React.createElement("option", { key: p, value: p }, p)))),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-status" }, "Status"),
                        React.createElement("select", { id: "adm-agendamentos-status", name: "adm-agendamentos-status", value: fStatus, onChange: e => setFStatus(e.target.value) },
                            React.createElement("option", { value: "TODOS" }, "Todos os status"),
                            Object.keys(AG_STATUS_LABEL).map(s => React.createElement("option", { key: s, value: s }, AG_STATUS_LABEL[s]))))),
                React.createElement("div", { style: { overflowX: 'auto', marginTop: 12 } },
                    React.createElement("table", null,
                        React.createElement("thead", null,
                            React.createElement("tr", null,
                                React.createElement("th", null, "C\u00F3digo"),
                                React.createElement("th", null, "Ve\u00EDculo"),
                                React.createElement("th", null, "Usu\u00E1rio que agendou"),
                                React.createElement("th", null, "Motorista"),
                                React.createElement("th", null, "Trajeto"),
                                React.createElement("th", null, "Previsto"),
                                React.createElement("th", null, "Real"),
                                React.createElement("th", null, "KM"),
                                React.createElement("th", null, "Status"))),
                        React.createElement("tbody", null, filtrados.map(a => React.createElement("tr", { key: a.id },
                            React.createElement("td", null, a.codigo),
                            React.createElement("td", null, a.placa),
                            React.createElement("td", null, a.solicitante || '—'),
                            React.createElement("td", null, a.motorista),
                            React.createElement("td", null,
                                a.origem,
                                " \u2192 ",
                                a.destino),
                            React.createElement("td", null,
                                fmtDataHora(a.saidaPrevista),
                                React.createElement("br", null),
                                fmtDataHora(a.retornoPrevisto)),
                            React.createElement("td", null,
                                fmtDataHora(a.saidaReal),
                                React.createElement("br", null),
                                fmtDataHora(a.retornoReal)),
                            React.createElement("td", null,
                                a.kmInicial || '—',
                                " \u2192 ",
                                a.kmFinal || '—'),
                            React.createElement("td", null,
                                React.createElement(AgendaStatus, { status: a.status }))))))))) : React.createElement(React.Fragment, null,
            React.createElement("div", { className: "row" },
                React.createElement("div", { className: "grow" },
                    React.createElement("h2", null, "Par\u00E2metros de agendamentos"),
                    React.createElement("div", { className: "muted" }, "Configura\u00E7\u00F5es lidas da lista Agendamentos_Parametros.")),
                React.createElement("button", { className: "btn btn-p", disabled: salvandoParam, onClick: salvarParametros }, salvandoParam ? 'Salvando...' : 'Salvar parâmetros')),
            React.createElement("div", { className: "card" },
                React.createElement("div", { className: "form-grid" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-dias-permitidos-para-frente" }, "Dias permitidos para frente"),
                        React.createElement("input", { id: "adm-agendamentos-dias-permitidos-para-frente", name: "adm-agendamentos-dias-permitidos-para-frente", autoComplete: "off", type: "number", value: paramForm.diasPermitidosFrente ?? '', onChange: e => alterarParam('diasPermitidosFrente', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-antecedencia-minima-para-criar-agendar-hor" }, "Anteced\u00EAncia m\u00EDnima para criar/agendar (horas)"),
                        React.createElement("input", { id: "adm-agendamentos-antecedencia-minima-para-criar-agendar-hor", name: "adm-agendamentos-antecedencia-minima-para-criar-agendar-hor", autoComplete: "off", type: "number", value: paramForm.antecedenciaMinimaHoras ?? '', onChange: e => alterarParam('antecedenciaMinimaHoras', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-duracao-maxima-horas" }, "Dura\u00E7\u00E3o m\u00E1xima (horas)"),
                        React.createElement("input", { id: "adm-agendamentos-duracao-maxima-horas", name: "adm-agendamentos-duracao-maxima-horas", autoComplete: "off", type: "number", value: paramForm.duracaoMaximaHoras ?? '', onChange: e => alterarParam('duracaoMaximaHoras', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-intervalo-entre-reservas-minutos" }, "Intervalo entre reservas (minutos)"),
                        React.createElement("input", { id: "adm-agendamentos-intervalo-entre-reservas-minutos", name: "adm-agendamentos-intervalo-entre-reservas-minutos", autoComplete: "off", type: "number", value: paramForm.intervaloReservasMinutos ?? '', onChange: e => alterarParam('intervaloReservasMinutos', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-hora-inicial-permitida" }, "Hora inicial permitida"),
                        React.createElement("input", { id: "adm-agendamentos-hora-inicial-permitida", name: "adm-agendamentos-hora-inicial-permitida", autoComplete: "off", type: "time", value: paramForm.horaInicialPermitida || '00:00', onChange: e => alterarParam('horaInicialPermitida', e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-hora-final-permitida" }, "Hora final permitida"),
                        React.createElement("input", { id: "adm-agendamentos-hora-final-permitida", name: "adm-agendamentos-hora-final-permitida", autoComplete: "off", type: "time", value: paramForm.horaFinalPermitida || '23:59', onChange: e => alterarParam('horaFinalPermitida', e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite s\u00E1bado"),
                        React.createElement(SimNao, { campo: "permiteSabado" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite domingo"),
                        React.createElement(SimNao, { campo: "permiteDomingo" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite feriado"),
                        React.createElement(SimNao, { campo: "permiteFeriado" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Confirma\u00E7\u00E3o autom\u00E1tica"),
                        React.createElement(SimNao, { campo: "confirmacaoAutomatica" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-periodicidade-do-checklist" }, "Periodicidade do checklist"),
                        React.createElement("select", { id: "adm-agendamentos-periodicidade-do-checklist", name: "adm-agendamentos-periodicidade-do-checklist", value: paramForm.checklistPeriodicidade || 'SEMANAL', onChange: e => alterarParam('checklistPeriodicidade', e.target.value) },
                            React.createElement("option", null, "DIARIO"),
                            React.createElement("option", null, "SEMANAL"),
                            React.createElement("option", null, "A_CADA_RETIRADA"))),
                    React.createElement("div", null,
                        React.createElement("label", null, "Abre checklist na NC"),
                        React.createElement(SimNao, { campo: "abreChecklistNaNC" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Resposta impeditiva bloqueia"),
                        React.createElement(SimNao, { campo: "respostaImpeditivaBloqueia" })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-codigo-checklist-frota-leve" }, "C\u00F3digo checklist Frota Leve"),
                        React.createElement("input", { id: "adm-agendamentos-codigo-checklist-frota-leve", name: "adm-agendamentos-codigo-checklist-frota-leve", autoComplete: "off", value: paramForm.codigoChecklistFrotaLeve || '', onChange: e => alterarParam('codigoChecklistFrotaLeve', e.target.value) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-libera-retirada-antes-da-saida-minutos" }, "Libera retirada antes da sa\u00EDda (minutos)"),
                        React.createElement("input", { id: "adm-agendamentos-libera-retirada-antes-da-saida-minutos", name: "adm-agendamentos-libera-retirada-antes-da-saida-minutos", autoComplete: "off", type: "number", value: paramForm.janelaRetiradaMinutos ?? '', onChange: e => alterarParam('janelaRetiradaMinutos', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "adm-agendamentos-tolerancia-devolucao-minutos" }, "Toler\u00E2ncia devolu\u00E7\u00E3o (minutos)"),
                        React.createElement("input", { id: "adm-agendamentos-tolerancia-devolucao-minutos", name: "adm-agendamentos-tolerancia-devolucao-minutos", autoComplete: "off", type: "number", value: paramForm.toleranciaDevolucaoMinutos ?? '', onChange: e => alterarParam('toleranciaDevolucaoMinutos', Number(e.target.value)) })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Permite finalizar antes"),
                        React.createElement(SimNao, { campo: "permiteFinalizarAnterior" })),
                    React.createElement("div", null,
                        React.createElement("label", null, "Libera no retorno real"),
                        React.createElement(SimNao, { campo: "liberaNoRetornoReal" }))))),
        form && React.createElement(FormAgendamento, { base: base, admin: true, dataInicial: diaSelecionado, onClose: () => setForm(false), onSalvo: carregar, toast: toast }),
        " ",
        detalhe && React.createElement(DetalheAgendamento, { item: detalhe, admin: true, onClose: () => setDetalhe(null), onAtualizar: carregar, toast: toast }));
}
