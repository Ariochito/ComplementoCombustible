document.getElementById('xmlFile').addEventListener('change', function (e) {
    const files = Array.from(e.target.files);

    if (files.length === 0) {
        alert("Por favor selecciona al menos un archivo XML");
        return;
    }

    const archivosInvalidos = files.filter(file => !file.name.toLowerCase().endsWith('.xml'));
    if (archivosInvalidos.length > 0) {
        alert(`Solo se permiten archivos XML:\n\n${archivosInvalidos.map(f => f.name).join('\n')}`);
        return;
    }

    procesarArchivos(files);
});

let _datosOriginales = [];

function convertirFecha(fechaStr) {
    const [dia, mes, anio] = fechaStr.split('/');
    return new Date(`${anio}-${mes}-${dia}`);
}

function procesarArchivos(files) {
    const allData = [];
    const historial = [];
    let processedFiles = 0;

    const ns = {
        cfdi: "http://www.sat.gob.mx/cfd/4",
        ecc12: "http://www.sat.gob.mx/EstadoDeCuentaCombustible12"
    };

    const processFile = (file, callback) => {
        const reader = new FileReader();
        reader.onload = function (event) {
            const xmlString = event.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");

            if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                callback(); return;
            }

            const complemento = xmlDoc.getElementsByTagNameNS(ns.cfdi, "Complemento")[0];
            if (!complemento) { callback(); return; }

            const estadoCuenta = complemento.getElementsByTagNameNS(ns.ecc12, "EstadoDeCuentaCombustible")[0];
            if (!estadoCuenta) { callback(); return; }

            const conceptosNode = estadoCuenta.getElementsByTagNameNS(ns.ecc12, "Conceptos")[0];
            const conceptos = conceptosNode?.getElementsByTagNameNS(ns.ecc12, "ConceptoEstadoDeCuentaCombustible") || [];
            if (conceptos.length === 0) {
                callback(); return;
            }

            // Obtener los primeros 8 caracteres del nombre del archivo como UUID
            const uuid = file.name.split('.')[0].substring(0, 8); // Tomamos solo los primeros 8 caracteres

            for (let concepto of conceptos) {
                const traslados = concepto.getElementsByTagNameNS(ns.ecc12, "Traslados")[0];
                let iva = 0;
                if (traslados) {
                    const traslado = traslados.getElementsByTagNameNS(ns.ecc12, "Traslado")[0];
                    if (traslado) {
                        iva = parseFloat(traslado.getAttribute('Importe')) || 0;
                    }
                }

                const importe = parseFloat(concepto.getAttribute('Importe')) || 0;
                const subtotal = parseFloat((iva / 0.16).toFixed(2));
                const ieps = parseFloat((importe - subtotal).toFixed(2));
                const total = parseFloat((subtotal + iva + ieps).toFixed(2));

                const fechaRaw = concepto.getAttribute('Fecha') || '';
                let fecha = 'N/A';
                if (fechaRaw.includes('T')) {
                    const [fechaParte] = fechaRaw.split('T');
                    const [anio, mes, dia] = fechaParte.split('-');
                    fecha = `${dia}/${mes}/${anio}`;
                } else if (fechaRaw.includes('-')) {
                    const [anio, mes, dia] = fechaRaw.split('-');
                    fecha = `${dia}/${mes}/${anio}`;
                } else {
                    fecha = fechaRaw;
                }

                allData.push({
                    UUID: uuid, // Usamos solo los primeros 8 caracteres del nombre del archivo como UUID
                    Identificador: concepto.getAttribute('Identificador') || 'N/A',
                    Fecha: fecha,
                    RFC: concepto.getAttribute('Rfc') || 'N/A',
                    Cantidad: concepto.getAttribute('Cantidad') || 'N/A',
                    NombreCombustible: concepto.getAttribute('NombreCombustible') || 'N/A',
                    Subtotal: subtotal,
                    IVA: iva,
                    IEPS: ieps,
                    Total: total
                });
            }

            historial.push(file.name);
            callback();
        };

        reader.onerror = function () {
            alert(`Error al leer el archivo ${file.name}`);
            callback();
        };

        reader.readAsText(file);
    };

    for (let file of files) {
        processFile(file, () => {
            processedFiles++;
            if (processedFiles === files.length) {
                const ordenados = allData.sort((a, b) => convertirFecha(a.Fecha) - convertirFecha(b.Fecha));
                _datosOriginales = ordenados;
                renderTable(ordenados);
                addExportButton(ordenados);
                updateHistorial(historial);
            }
        });
    }
}

function renderTable(data) {
    const tbody = document.getElementById('conceptosBody');
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        Object.values(item).forEach((valor, index) => {
            const td = document.createElement('td');
            td.textContent = typeof valor === 'number' ? valor.toFixed(2) : valor;
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });

    poblarAnios(data);
}

function poblarAnios(data) {
    const anios = new Set();
    data.forEach(item => {
        const partes = item.Fecha.split('/');
        if (partes.length === 3) {
            anios.add(partes[2]);
        }
    });

    const anioSelect = document.getElementById('anio');
    anioSelect.innerHTML = `<option value="">Todos</option>`;
    Array.from(anios).sort().forEach(anio => {
        const option = document.createElement('option');
        option.value = anio;
        option.textContent = anio;
        anioSelect.appendChild(option);
    });
}

function aplicarFiltro() {
    const mes = document.getElementById('mes').value;
    const anio = document.getElementById('anio').value;

    const filtrados = _datosOriginales.filter(item => {
        const partes = item.Fecha.split('/');
        if (partes.length !== 3) return false;
        const [dia, mm, aaaa] = partes;
        return (mes === '' || mm === mes) && (anio === '' || aaaa === anio);
    });

    renderTable(filtrados);
    addExportButton(filtrados);
    // Mantener el año seleccionado
    document.getElementById('anio').value = anio;
}

function addExportButton(data) {
    const botones = document.getElementById('botones');
    botones.innerHTML = '';

    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportBtn';
    exportBtn.textContent = 'Exportar a Excel';
    exportBtn.addEventListener('click', () => exportToExcel(data));

    const downloadHistorialBtn = document.createElement('button');
    downloadHistorialBtn.id = 'downloadHistorialBtn';
    downloadHistorialBtn.textContent = 'Descargar historial';
    downloadHistorialBtn.addEventListener('click', () => descargarHistorial());

    botones.appendChild(exportBtn);
    botones.appendChild(downloadHistorialBtn);
}

function exportToExcel(data) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Conceptos");
    XLSX.writeFile(workbook, "ConceptosCombustible.xlsx");
}

function updateHistorial(historial) {
    const div = document.getElementById('historial');
    div.innerHTML = `<strong>Archivos procesados correctamente:</strong><br>${historial.map(f => `• ${f}`).join('<br>')}`;
    window._historialActual = historial;
}

function descargarHistorial() {
    if (!window._historialActual || window._historialActual.length === 0) return;

    const blob = new Blob([window._historialActual.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historial_archivos.txt';
    a.click();
    URL.revokeObjectURL(url);
}
