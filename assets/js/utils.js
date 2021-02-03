const moment = require('moment');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const parse = require('csv-parse/lib/sync');
const fs = require('fs');
const config = require("./config");


const validFlags = ['V', 'O', 'R'];

const checkFileType = (file) => {

    let a = file.replaceAll('_', '-');
    let b = a.split('-');
    if (b.includes('quinceminutales')) {
        return 'quinceminutales';
    } else if (b.includes('horarios')) {
        return 'horarios';
    } else {
        return null;
    }
};

/**
 * Este método recibe la lista de ficheros quinceminutales y devuelve esa misma lista
 * pero transformados a horarios. Para eso utiliza el método "quinceMinAHorario" situado en
 * este mismo archivo.
 * @param {Object Array} files15m 
 */
const transform15mTo60m = files15m => {

    if (!files15m) { return null }

    // este es el objeto que devuelve este método y contiene los datos modificados a horarios.
    let arr = []
    files15m.forEach(file => {

        // pasamos sus datos a Horarios
        let dataH = quinceMinAHorario(file.data);

        file.data = dataH;
        file.type = "horarios";

        arr.push(file);
    });

    return arr;

}
/**
 * Cuando leemos los archivos csv, tenemos datos que están fusionados en la misma columna
 * como la "FECHA HORA", o "DATOS FLAG". Este método los separa para poder, mas adelante,
 * trabajar con cada valor.
 * @param {Object array} files 
 */
const splitColumns = file => {  

    if (!file) { return null }


    // aquí almacenaremos los datos ya divididos
    let newData = [];
    //recorremos los datos fila por fila y los vamos dividiendo
    file.data.forEach((row, index1) => {

        // fragmentamos la fila para trabajar columna a columna
        let arrEntries = Object.entries(row);

        // creamos una variable donde almacenar la nueva fila dividida
        let splitedRow = {};
        arrEntries.forEach((arrColumn, index2) => {

            if (arrColumn[0] == "FECHA HORA") {

                let splitedVal = arrColumn[1].split(" ");

                splitedRow.FECHA = splitedVal[0];
                splitedRow.HORA = splitedVal[1];

            } else {

                // Como algunos titulos tienen espacio en blanco en medio, se extrae el titulo asi:
                let splitedTitle = arrColumn[0].split(" ");
                splitedTitle.pop(); // quitamos "flag" del array
                let finalTitle = splitedTitle.join(" ");

                let splitedValue = arrColumn[1].split(" ");

                /* aqui guardamos el valor. Si el archivo es de tipo horario, lo guardamos sin alterar. Si es quinceminutal, le cambiamos 
                la coma por un punto para poder realizar operaciónes matemáticas en los siguientes pasos. */
                splitedRow[`${finalTitle} value`] = file.type=="horarios"?splitedValue[0] :stringToNumber(splitedValue[0]);
                splitedRow[`${finalTitle} flag`] = splitedValue[1];
            }
        });
        newData.push(splitedRow);
    });
    // a partir de aquí, ya tenemos los datos reconstruidos. Ya podemos volver a montar el archivo entero añadiendole los datos nuevos
    file.data = newData;
    return file;
}

/**
 * Este método coge la lista de ficheros de entrada y prepara la estructura que se va a usar mas adelante
 * para fusionar los datos de los archivos que tengan en común el mismo contaminante. Es decir, agrupa 
 * todos los paquetes de datos por contaminante.
 * @param {Array} files 
 */
const mergeFilesByKeys = files => {

    let array = []; // Contiene el la lista de contaminantes y sus datos agrupados pero no fusionados. La fusión se realiza mas abajo.

    files.forEach((file, indexFile, arrFiles) => {

        // buscamos si el contaminante ya está registrado en nuestra lista de contaminantes (array)
        let con = array.find(el => el.key == file.key)

        if (con) { // si existe el contamiante en la lista, añadimos los datos

            con.files.push({ name: file.name, fileURL: file.fileURL, id: file.id, data: file.data });

        } else { // si no existe el contaminante, lo registramos

            array.push(
                {
                    key: file.key,
                    files: [{ name: file.name, fileURL: file.fileURL, id: file.id, data: file.data }],

                }
            )
        }
    });

    // ahora que hemos agrupado los datos por contaminantes ( keys) debemos fusionarlos.
    let fusion = [] // aquí guardaremos la lista de contaminantes con sus respeticos datos fusionados.
    // recorremos cada contaminante
    array.forEach(contam => {

        if (contam.files.length > 1) { // si hay varios grupos de datos, debemos fusionarlos

            let dataFusion = []; // aquí vamos a guardar los datos fusionados

            contam.files.forEach((file, index2, arr) => {

                if (index2 == 0) { // cuando es el primer grupo de datos, lo guardamos entero incluido fecha y hora
                    dataFusion = file.data;
                } else {
                    // ahora añadiremos los datos de los siguientes grupos de datos pero sin repetir la columna de fecha y hora.
                    file.data.forEach((row, index3) => {

                        delete row.FECHA;
                        delete row.HORA;

                        Object.assign(dataFusion[index3], row)

                    })
                }
            });

            fusion.push({
                key: contam.key,
                data: dataFusion
            })


        } else { // si solo hay 1 grupo de dato, no hay nada que fusionar y podemos guardarlo talcual.

            fusion.push({
                key: contam.key,
                data: contam.files[0].data
            })

        }

    });

    return fusion;
};

/**
 * Este método genera configuraciónes personalizadas para la escritura de los archivos csv.
 * @param {String} output 
 * @param {Array} header 
 */
const getCreateCsvWriter = (output, header) => {
    return createCsvWriter({
        path: output,
        header,
        fieldDelimiter: ';'
    })
}

/**
 * Este método coge una lista de URLs de archivos, los lee y devuelve un array con todos sus datos separados, nombres, datos, etc.
 * Pero las columnas siguen fusionadas. Por ejemplo fecha y hora siguen juntos. La separación de columnas se realiza en el método "splitColumns"
 * @param {*} arrayURLs 
 */
const extractFiles = (arrayURLs) => {

    let files = [];

    // esto va a servir para darles un id único a cada archivo
    let idCounter = 0;

    // recorremos cada una de las url
    arrayURLs.forEach(url => {


        let ar1 = url.split("\\"); // dividimos la url
        let s1 = ar1[ar1.length - 1]; // nos quedamos con el último trozo que es el que contiene el nombre
        let ar2 = s1.split("."); // separamos el nombre por puntos para quitar la extensión ".txt"o".csv" en el siguiente paso
        ar2.pop(); // quitamos la extensión
        let s2 = ar2.join(); // aquí se almacena el nombre completo
        let ar3 = s2.split('-');
        let ar4 = ar3[1].replaceAll("_", "-").split("-"); // extraemos un array que contenga el tipo.
        let s3 = ar4[0]; // tipo. es decir, "quinceminutal" "horario"

        //leemos el archivo y guardamos los datos en una variable llamada "records"
        let fileData = fs.readFileSync(url, 'utf8');


        const records = parse(fileData, {
            columns: headers => { // como los archivos generados por envira tienen las cabeceras mal (hay una de más y vacía). vamos a eliminar la que está mal.
                return headers.filter(header => header.length > 0);
            },
            delimiter: ";",
            skip_empty_lines: true,
            relaxColumnCount: true
        })

        /* const records = parse(fileData, {
            delimiter: ";",
            skip_empty_lines: true,
            relaxColumnCount: true
        })
        // como los archivos generados por envira tienen las cabeceras mal (hay una de más y vacía).
        // vamos a eliminar la que está mal.
        let cabecera = records[0].filter(heads => heads.length > 0);
        records[0] = cabecera; */

        files.push({
            id: idCounter,
            name: s2,
            key: ar3[0],
            type: s3,
            fileURL: url,
            data: records
        })

        idCounter++;
    });
    return files


};

/**
 * convierte un string en número. Si tiene una "," de separador de decimales, la sustiuye por un "."
 * @param {Numero} string 
 */
const stringToNumber = (string) => {
    let result = Number(string);
    if (isNaN(result)) {
        return Number(string.replace(",", "."));
    }
    return result;

}

const getColumTitles = (data) => {

    //guardamos los titulos de las columnas menos la de fecha y hora.
    let columnTi = Object.keys(data[0]); // como son iguales para todos, solo usaremos la primera fila del array
    let indFecha = columnTi.indexOf('FECHA');
    let indHora = columnTi.indexOf('HORA');

    if (indFecha != -1 && indHora != -1) { // quitamos la fecha y hora
        columnTi.splice(indFecha, 1);
        columnTi.splice(indFecha, 1);
    }

    let uniqueColTi = [];
    columnTi.forEach(title => {


        let a = title.split(' ');
        a.pop();
        let b = a.join(' ');

        uniqueColTi.push(b);

    });

    function onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }
    uniqueColTi = uniqueColTi.filter(onlyUnique);

    return uniqueColTi;
}

/**
 * Recibe los contaminantes en formato horario y devuelve los contaminantes en formato diario.
 * @param {Object Array} arrDat 
 */
const horarioADiario = (arrDat) => {

    // este es el array que va a ser devuelto por este método. Debe contener los contaminantes con los datos diarios.
    let arrayFinal = []
    // vamos a recorrer cada contaminante
    arrDat.forEach(contaminante => {


        let cont = { key: contaminante.key, data: null };
        let dataH = [...contaminante.data]

        let datosFin = []; //Aquí almacenamos los datos procesados que debemos retornar.    

        //guardamos los titulos de las columnas
        let columnTitles = getColumTitles(dataH);
        //array de objetos que contienen los datos horarios. Usado como plantilla
        let contadores = [];

        //rellenamos\preparamos los "contadores" de cada estación
        columnTitles.forEach(title => {

            contadores.push({ 
                titulo: title,
                fecha: null, // estamos creado el equema de 24H. La fecha se la pondremos después
                hora: null,
                dia: null,
                value: [], // contador de valores
                flag: [], // contador de flags

            })
        });

        let diaActual = null;
        let fechaActual = null;

        // recorremos los datos para ir operando con los datos
        for (let i = 0; i < dataH.length; i++) {

            // inicializamos guardando el primer día que se va a guardar
            if (diaActual == null) {
                diaActual = dataH[i].FECHA.split('-')[0];
                fechaActual = dataH[i].FECHA;
            }


            // creamos unas variables que, comparandolas con la fecha y dia actual, indicarán si hemos cambiado de franja.
            let diaTemp = dataH[i].FECHA.split('-')[0];//comprobamos que seguimos en el mismo tramo de hora
            let fechaTemp = dataH[i].FECHA;

            if (diaTemp == diaActual) { // Aquí programamos lo que ocurre cuando seguimos en la misma franja diaria

                contadores.forEach((cont, index) => { //mientras estamos en el mismo periodo horario, sumamos los valores y flags

                    cont.value.push(stringToNumber(dataH[i][`${cont.titulo} value`])); // guardamos los valores para calcularlos depues
                    cont.flag.push(dataH[i][`${cont.titulo} flag`]);

                });

                // Cuando estamos al final del array y no hay cambio de día porque no hay mas datos, grabamos los últimos datos
                if (i == dataH.length - 1) {

                    let objFin = { FECHA: fechaActual, DIA: diaActual }; // creamos un objeto basico al que ir completando


                    contadores.forEach(cont => { //recorremos los contadores para hacer medias con las flags y values

                        let valueFinal = null;
                        let flagFinal = null;

                        // vamos a comporbar los valores. que hayan minimo 3, que de esos los 3 sean validos
                        if (cont.value.length < 18) { //si hay menos de 75% (18), directamente los marcamos como inválidos.
                            valueFinal = -9999;
                            flagFinal = 'N';
                        } else { // si hay 18 (75%) o más valores, debemos comprobar su contenido

                            let sumaValue = 0; // la suma de los valores que son correctos
                            let numValValid = 0; // contador de valores válidos


                            for (let j = 0; j < cont.value.length; j++) { // recorremos los 18 valores almacenados

                                if (validFlags.includes(cont.flag[j])) { // si la flag es válida

                                    sumaValue += cont.value[j]; // sumamos el valor valido
                                    numValValid++; // aumentamos el contador de valores validos

                                }

                            }

                            //operaciónes finales                    
                            if (numValValid < 18) { //si tenemos menos de 3 valores validos, no llega al mínimo de 75%. Por lo tanto es inválido

                                valueFinal = -9999;
                                flagFinal = 'N';

                            } else {

                                valueFinal = `${(Math.round((sumaValue / numValValid) * 100) / 100).toFixed(2)}`.replace('.', ',');
                                flagFinal = 'V';

                            }
                        }
                        objFin[`${cont.titulo} value`] = valueFinal;
                        objFin[`${cont.titulo} flag`] = flagFinal;


                    });

                    datosFin.push(objFin);
                }

            } else { // Aquí programamos lo que ocurre cuando cambiamos de hora 
                let objFin = { FECHA: fechaActual, DIA: diaActual }; // creamos un objeto basico al que ir completando


                contadores.forEach(cont => { //recorremos los contadores para hacer medias con las flags y values

                    let valueFinal = null;
                    let flagFinal = null;

                    // vamos a comporbar los valores. que hayan minimo 3, que de esos los 3 sean validos
                    if (cont.value.length < 18) { //si hay menos de 75% (18), directamente los marcamos como inválidos.
                        valueFinal = -9999;
                        flagFinal = 'N';
                    } else { // si hay 18 (75%) o más valores, debemos comprobar su contenido

                        let sumaValue = 0; // la suma de los valores que son correctos
                        let numValValid = 0; // contador de valores válidos


                        for (let j = 0; j < cont.value.length; j++) { // recorremos los 18 valores almacenados

                            if (validFlags.includes(cont.flag[j])) { // si la flag es válida

                                sumaValue += cont.value[j]; // sumamos el valor valido
                                numValValid++; // aumentamos el contador de valores validos

                            }

                        }

                        //operaciónes finales                    
                        if (numValValid < 18) { //si tenemos menos de 3 valores validos, no llega al mínimo de 75%. Por lo tanto es inválido

                            valueFinal = -9999;
                            flagFinal = 'N';

                        } else {

                            valueFinal = `${(Math.round((sumaValue / numValValid) * 100) / 100).toFixed(2)}`.replace('.', ',');
                            flagFinal = 'V';

                        }
                    }
                    objFin[`${cont.titulo} value`] = valueFinal;
                    objFin[`${cont.titulo} flag`] = flagFinal;


                });

                datosFin.push(objFin);

                //reiniciamos los valores 
                contadores.forEach(cont => {

                    cont.value = [];
                    cont.flag = [];

                });

                //introducimos los datos de este primer cambio de hora
                contadores.forEach(cont => { // añadimos el último valor de este periodo horario a todos los contadores

                    cont.value.push(stringToNumber(dataH[i][`${cont.titulo} value`]));
                    cont.flag.push(dataH[i][`${cont.titulo} flag`]);

                });

                //reiniciamos los datos para el siguiente cambio de dia
                //diaActual = diaTemp == '24' ? '00' : diaTemp;
                diaActual = diaTemp
                fechaActual = fechaTemp;
            }
        }

        cont.data = datosFin;
        arrayFinal.push(cont);

    });

    return arrayFinal;

}

/**
 * Pasa datos de 15 minutales a horarios.
 * Debe cumplir:
 * 1- si hay menos de 3 elementos 15 minutales en 1 hora -> Invalido
 * 2- Verificar que los datos sean validos (no sean -9999 o flags inválidas)
 * 3- hacer la media aritmética de los 4 (o 3 valores).
 * @param {Array Object} data15m 
 */
const quinceMinAHorario = (data15m) => {

    // comprobación de que no esté vacio
    if (data15m.length == 0) {
        return null
    };

    let datosFin = []; //Aquí almacenamos los datos procesados que debemos retornar.    

    //guardamos los titulos de las columnas
    let columnTitles = getColumTitles(data15m);
    //array de objetos que contienen los datos horarios. Usado como plantilla
    let contadores = [];

    //rellenamos "contadores" 
    columnTitles.forEach(title => {

        contadores.push({
            titulo: title,
            fecha: null, // estamos creado el equema de 24H. La fecha se la pondremos después
            hora: null,
            value: [], // contador de valores
            flag: [], // contador de flags

        })
    });

    let horaActual = null; // esta variable es un contador que vigila cuando se cambia de hora
    let fechaActual = null; // contador que vigila si cambiamos de día

    // recorremos los datos para ir usando los contadores.
    for (let i = 0; i < data15m.length; i++) {


        // inicializamos guardando la primera hora que se va a tratar
        if (horaActual == null) {
            horaActual = data15m[i].HORA.split(':')[0];
        }
        fechaActual = data15m[i].FECHA;

        // creamos unas variables que, comparandolas con la fecha y hora actual, indicarán si hemos cambiado de franja.
        let horaTemp = data15m[i].HORA.split(':')[0];//comprobamos que seguimos en el mismo tramo de hora
        let fechaTemp = data15m[i].FECHA;

        if (horaTemp == horaActual) { // Aquí programamos lo que ocurre cuando seguimos en la misma franja horaria del mismo día

            contadores.forEach(cont => { //mientras estamos en el mismo periodo horario, sumamos los valores y flags

                cont.value.push(data15m[i][`${cont.titulo} value`]); // guardamos los valores para calcularlos depués
                cont.flag.push(data15m[i][`${cont.titulo} flag`]);

            });
        } else { // Aquí programamos lo que ocurre cuando cambiamos de hora

            let objFin = { FECHA: fechaActual, HORA: `${horaTemp}:00` }; // creamos un objeto basico al que ir completando

            contadores.forEach(cont => { // añadimos el último valor de este periodo horario a todos los contadores

                cont.value.push(data15m[i][`${cont.titulo} value`]);
                cont.flag.push(data15m[i][`${cont.titulo} flag`]);

            });

            contadores.forEach(cont => { //recorremos los contadores para hacer medias con las flags y values

                let valueFinal = null;
                let flagFinal = null;

                // vamos a comporbar los valores. que hayan minimo 3, que de esos los 3 sean validos
                if (cont.value.length < 3) { //si hay menos de 3, directamente los marcamos como inválidos.
                    valueFinal = -9999;
                    flagFinal = 'N';
                } else { // si hay 3 o más valores, debemos comprobar su contenido

                    let sumaValue = 0; // la suma de los valores que son correctos
                    let numValValid = 0; // contador de valores válidos


                    for (let j = 0; j < cont.value.length; j++) { // recorremos los 3 o 4 valores almacenados

                        if (validFlags.includes(cont.flag[j])) { // si la flag es válida

                            sumaValue += cont.value[j]; // sumamos el valor valido
                            numValValid++; // aumentamos el contador de valores validos

                        }

                    }

                    //operaciónes finales
                    //if (numValueInvalidos > 1 || (numValueInvalidos <= 1 && numFlagInvalidas > 1)) {
                    if (numValValid < 3) { //si tenemos menos de 3 valores validos, no llega al mínimo de 75%. Por lo tanto es inválido

                        valueFinal = -9999;
                        flagFinal = 'N';

                    } else {

                        valueFinal = `${(Math.round((sumaValue / numValValid) * 100) / 100).toFixed(2)}`.replace('.', ',');
                        flagFinal = 'V';

                    }
                }
                objFin[`${cont.titulo} value`] = valueFinal;
                objFin[`${cont.titulo} flag`] = flagFinal;


            });

            datosFin.push(objFin);

            //reiniciamos los datos para el siguiente cambio de hora
            horaActual = horaTemp == '24' ? '00' : horaTemp;
            fechaActual = fechaTemp;

            //introducimos los datos de este primer cambio de hora
            contadores.forEach(cont => {

                cont.value = []; //reiniciamos los valores                
                cont.flag = [];

            });
        }
    };

    return datosFin;


}

/**
 * Recoge los datos horarios y devuelve los datos transformados a octohorarios máximos diarios
 * @param {Array object} dataH 
 */
const horaAOcto = (arrDat) => {

    // este es el array que va a ser devuelto por este método. Debe contener los contaminantes con los datos diarios.
    let arrayFinal = []
    // vamos a recorrer cada contaminante
    arrDat.forEach(contaminante => {

        //solo vamos a pasar a 8horario los que tengamos en la lista de configuración
        if (config.cont8hList.includes(contaminante.key)) {

            let cont = { key: contaminante.key, data: null };
            let dataH = [...contaminante.data]

            // comprobación de que no esté vacio
            if (dataH.length == 0) {
                return null
            };
            // creamos una copia invertida de los datos 
            let invData = [...dataH].reverse();

            //Aquí almacenamos los datos procesados que debemos retornar.    
            let datosFin = [];
            // Aquí almacenamos los datos final del primer paso. Es decir el de las medias Octohorarias.
            let datosFinOcto = [];

            //guardamos los titulos de las columnas
            let columnTitles = getColumTitles(dataH);
            //array de objetos que contienen los datos horarios. Usado como plantilla
            let contadores = [];

            //rellenamos\preparamos los "contadores" de cada estación
            columnTitles.forEach(title => {

                contadores.push({ 
                    titulo: title,
                    fecha: null, // estamos creado el equema de 24H. La fecha se la pondremos después
                    hora: null,
                    dia: null,
                    value: [], // contador de valores
                    flag: [], // contador de flags

                })
            });

            //recorremos todos los datos
            for (let i = 0; i <= invData.length - 24; i++) { // quitamos 1 día porque es un día extra añadido solo para calcular los octohorarios.

                let objOcto = { FECHA: invData[i].FECHA, HORA: invData[i].HORA };

                // trabajamos los datos en bloques de 8
                for (let j = 0; j < 8; j++) {

                    // guardamos los valores y flags en cada contador
                    contadores.forEach(cont => {
                        cont.value.push(stringToNumber(invData[i + j][`${cont.titulo} value`]))
                        cont.flag.push(invData[i + j][`${cont.titulo} flag`])
                    });
                }
                // volvemos a pasar por los contadores, pero esta vez para hacer las medias
                contadores.forEach(cont => {


                    let sumaValue = 0; //suma de todos los números válidos    
                    let numValValid = 0; // contadore de números válidos. Usado para hayar la media.

                    // contamos y sumamos los valores validos
                    for (let k = 0; k < cont.value.length; k++) {

                        if (validFlags.includes(cont.flag[k])) { // si la flag es válida

                            sumaValue += cont.value[k]; // sumamos el valor valido
                            numValValid++; // aumentamos el contador de valores validos

                        }
                    }

                    let valueFinOcto = null;
                    let flagFinOcto = null;
                    //hacemos los cálculos finales 
                    if (numValValid < 6) {

                        valueFinOcto = -9999;
                        flagFinOcto = 'N';

                    } else {

                        valueFinOcto = `${(Math.round((sumaValue / numValValid) * 100) / 100).toFixed(2)}`;
                        flagFinOcto = 'V';

                    }
                    objOcto[`${cont.titulo} value`] = valueFinOcto;
                    objOcto[`${cont.titulo} flag`] = flagFinOcto;
                });

                datosFinOcto.push(objOcto);
                // reiniciamos los contadores para el siguiente periodo de 8
                contadores.forEach(cont => {

                    cont.value = [];
                    cont.flag = [];

                });

            }

            let fechaAc = null;
            let diaAc = null;


            // ahora que tenemos los octohorarios calculados, sacaremos la máxima diaria y 
            // devolveremos un formato diario.-----------------------------------------------
            for (let m = 0; m < datosFinOcto.length; m++) {


                // iniciamos la primera vez
                if (diaAc == null) {
                    fechaAc = datosFinOcto[m].FECHA;
                    diaAc = datosFinOcto[m].FECHA.split('-')[0];
                }

                let diaTemp2 = datosFinOcto[m].FECHA.split('-')[0];
                let fechaTemp2 = datosFinOcto[m].FECHA;

                if (diaTemp2 == diaAc) { // cuando trabajamos en el mismo día

                    contadores.forEach(cont => { //mientras estemos en el mismo día, sumamos los valores y flags

                        cont.value.push(stringToNumber(datosFinOcto[m][`${cont.titulo} value`])); // guardamos los valores para calcularlos depues
                        cont.flag.push(datosFinOcto[m][`${cont.titulo} flag`]);

                    });


                } else {// cuando cambiamos de día


                    let objFin = { FECHA: fechaAc, HORA: '' }; // creamos un objeto basico al que ir completando

                    //Calculamos los máximos
                    contadores.forEach(cont => {

                        let valueFinal = null;
                        let flagFinal = null;

                        if (cont.value.length < 18) {// si no hay un mínimo de valores

                            valueFinal = -9999;
                            flagFinal = 'N';

                        } else { // si hay un minimo de valores, comprobamos su contenido

                            let numValValid = 0; // contador de valores válidos

                            // recorremos los valores almacenados dentro de ese contador
                            for (let n = 0; n < cont.value.length; n++) {

                                if (validFlags.includes(cont.flag[n])) { // si la flag es válida

                                    numValValid++; // aumentamos el contador de valores validos

                                }
                            }

                            //operaciónes finales                    
                            if (numValValid < 18) { //si tenemos menos de 3 valores validos, no llega al mínimo de 75%. Por lo tanto es inválido

                                valueFinal = -9999;
                                flagFinal = 'N';

                            } else {

                                /* valueFinal = `${(Math.round((sumaValue / numValValid) * 100) / 100).toFixed(2)}`.replace('.', ',');
                                 */
                                valueFinal = `${(Math.max(...cont.value)).toFixed(2)}`.replace('.', ',');
                                flagFinal = 'V';

                            }
                        }
                        objFin[`${cont.titulo} value`] = valueFinal;
                        objFin[`${cont.titulo} flag`] = flagFinal;

                    });

                    //guardamos la fila en los datos finales
                    datosFin.push(objFin)

                    //reiniciamos los contadores para almacenar el siguiente día
                    contadores.forEach(cont => {

                        cont.value = [];
                        cont.flag = [];

                    });

                    //guardamos los datos de este nuevo día
                    contadores.forEach(cont => { //mientras estemos en el mismo día, sumamos los valores y flags

                        cont.value.push(stringToNumber(datosFinOcto[m][`${cont.titulo} value`])); // guardamos los valores para calcularlos depues
                        cont.flag.push(datosFinOcto[m][`${cont.titulo} flag`]);

                    });

                    //actualizamos la fecha a este nuevo día
                    fechaAc = datosFinOcto[m].FECHA;
                    diaAc = datosFinOcto[m].FECHA.split('-')[0];
                }



            }
            datosFin.reverse();
            cont.data = datosFin;
            arrayFinal.push(cont);
        }
    });
    return arrayFinal;
}



module.exports = {
    transform15mTo60m,
    splitColumns,
    mergeFilesByKeys,
    getCreateCsvWriter,
    stringToNumber,
    extractFiles,
    quinceMinAHorario,
    horarioADiario,
    getColumTitles,
    checkFileType,
    horaAOcto
}