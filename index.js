/* eslint-disable no-useless-escape */
const csv = require('csv');
const fs = require('fs');
const assert = require('assert');
const Excel = require('exceljs');
const lo = require('lodash')

const csvParser = csv.parse();

const csvFileReadStream = fs.createReadStream(
  './dataset/pcubed-logs-during-downtime-4-30-T6-30-to-4-30-T7-30.csv',
);

const csvParserWithReadStream = csvFileReadStream.pipe(csvParser);

/**
 * @type {APIanalysis}
 */
const apiAnalysis = new Map()

/**
 * @type {APImetrics}
 */
const DEFUALT_API_METRICS = {
  avgRespTime: 0,
  noOfHits: 0,
  respCodeMetrics: {
    200: 0, 302: 0, 304: 0, 401: 0, 403: 0, 404: 0, 500: 0, 503: 0, NoResp: 0, 400: 0,
  },
};

csvParserWithReadStream
  .on('readable', () => {
    let log;
    // eslint-disable-next-line no-cond-assign
    while ((log = csvParserWithReadStream.read())) {
      assert.strictEqual(log.length, 1);
      analyzeAPI(log[0]);
    }
  })
  .on('error', (err) => {
    console.error('some error occurred: ', err.message);
  })
  .on('end', async () => {
    console.log("Analysing API's done.");
    console.log(apiAnalysis);
    await generateReportInExcel();
  });

/**
 * @param {LogData} logData
 */
function analyzeAPI(logData) {
  if (logData === 'record.log') {
    return;
  }

  const result = getAPIdetails(logData)

  if (!result) {
    return;
  }

  const {
    apiType: currentApiType,
    nonApiURL: currentNonApiURL,
    respTime: currentAPIrespTime,
    respCode: currentAPIrespCode,
  } = result;

  const key = currentApiType || currentNonApiURL

  const {
    avgRespTime: prevAvgRespTime,
    respCodeMetrics,
    noOfHits: prevNoOfHits,
  } = apiAnalysis.get(key) || lo.cloneDeep(DEFUALT_API_METRICS);

  const newNoOfHits = prevNoOfHits + 1;

  const newAvgRespTime = (prevAvgRespTime * prevNoOfHits + Number(currentAPIrespTime)) / newNoOfHits;

  respCodeMetrics[currentAPIrespCode] += 1

  apiAnalysis.set(key, {
    noOfHits: newNoOfHits,
    avgRespTime: newAvgRespTime,
    respCodeMetrics,
  });
}

async function generateReportInExcel() {
  const workbook = new Excel.Workbook();
  const worksheet = workbook.addWorksheet('API-analysis-during-downtime-4-30-T6-30-to-4-30-T7-30');
  worksheet.columns = [
    { header: 'API-URL', key: 'apiURL', width: 100 },
    // { header: 'Method', key: 'method' },
    { header: 'AvgRespTime', key: 'avgRespTime', width: 20 },
    { header: 'NoOfHits', key: 'noOfHits', width: 20 },
    { header: '200', key: '200' },
    { header: '500', key: '500' },
    { header: 'NoResp', key: 'NoResp' },
    { header: '400', key: '400' },
    { header: '401', key: '401' },
    { header: '302', key: '302' },
    { header: '304', key: '304' },
    { header: '403', key: '403' },
    { header: '404', key: '404' },
    { header: '503', key: '503' },
  ];
  worksheet.getRow(1).eachCell((cell) => {
    // eslint-disable-next-line no-param-reassign
    cell.font = { bold: true };
  });
  apiAnalysis.forEach((APImetrics, apiURL) => {
    const { avgRespTime, noOfHits, respCodeMetrics } = APImetrics;
    const row = {
      apiURL, avgRespTime, noOfHits, ...respCodeMetrics,
    }
    worksheet.addRow(row);
  });
  await workbook.xlsx.writeFile('API-ANALYSIS-during-downtime-4-30-T6-30-to-4-30-T7-30.xlsx');
}

/**
 *
 * @param {string} log
 * @returns {APIdetails} apiDetails
 */
function getAPIdetails(log) {
  // console.log(log)
  const matchResult = log.match(logRegex)

  if (!matchResult) {
    return null
  }

  const matchedGroups = matchResult.groups;

  if (!matchedGroups) {
    throw Error(
      `Did not capture any groups in regex for ------->${log}<--------`,
    );
  }
  /**
   * @type {APIdetails}
   */
  // @ts-ignore
  const apiDetails = matchedGroups

  apiDetails.bottleneckUID = matchedGroups.bottleneckUIDForEorT
    || matchedGroups.bottleneckUIDForB
    || matchedGroups.optBottleneckUID;
  apiDetails.rawLog = log;
  // console.log(apiDetails);

  return apiDetails;
}

const UIDregex = '[A-F0-9a-f]{8}(?:-[A-F0-9a-f]{4}){3}-[A-F0-9a-h]{12}';

const bottleneckUIDregexForEorT = `(?<bottleneckUIDForEorT>${UIDregex})`;

const bottleneckUIDForB = `(?<bottleneckUIDForB>${UIDregex})`;

const optBottleneckUIDregex = `(?<optBottleneckUID>${UIDregex})`;

const plantUIDregex = `(?<plantUID>${UIDregex})`;

const lossReasonUIDregex = `(?<lossReasonUID>${UIDregex})`;

const orgUID = '(?<orgUID>\\w*)';

const apiURLtypeRegex = `api\\/tenants\\/(?<apiURL>(?<apiType>(?<tenantName>.*)\\/(entries|targets)\\?bottleneck_uid=${bottleneckUIDregexForEorT}|sse_socket\\?subs|data_entry|logo|client_languages|changeovers|reports\\/loss_reasons_pareto|reports\\/waterfall|clients|machine_types\\?raw=[1,0]|entries|bottlenecks|network|sub_losses|last_updated|shifts|global_losses\\?raw|loss_types\\?plant_uid=${plantUIDregex}|loss_reasons\\?opt_bottleneck_uid=${optBottleneckUIDregex}|loss_reasons\\?loss_reason_guid=${lossReasonUIDregex}|projects\\?organization_uid=${orgUID}|watches\\?raw|bottlenecks\\/${bottleneckUIDForB}).*)`;

const methodRegEx = '(?<method>GET|POST|PUT|DELETE|PATCH)';

const fullURLregex = `(?<fullURL>\\/+ils\\/pcubed\\/(${apiURLtypeRegex})|(?<nonApiURL>.*))`;

// const httpVerRegEx = '(?<httpVer>HTTP\\/\\d\\.\\d")';

const respCodeRegEx = '(?<respCode>\\d{3})';

const respTimeRegEx = '(?<respTime>\\d*)\\D?s?';

const trailingRegex = '(?<garbage>"-"|"https:|→|× JSON)';

// const logTypeAorCregex = new RegExp(
//   `${methodRegEx} ${fullURLregex} ${httpVerRegEx} ${respCodeRegEx} ${respTimeRegEx} ${trailingRegex}`,
// );

const logRegex = new RegExp(
  `${respCodeRegEx} ${respTimeRegEx} ${methodRegEx} ${fullURLregex} ${trailingRegex}`,
);

// const logTypeEregex = new RegExp(
//   `\\[error\\] \\d*#\\d*: (?<errorMessage>.*), client: (?<client>.*), server: (?<server>.*), request: "${methodRegEx} ${fullURLregex} ${httpVerRegEx}, upstream: "(?<upstream>.*)", host: "(?<host>.*)", referrer: "(?<referrer>.*)"`,
// );

// const logTypeFregex = new RegExp(`Request: ${methodRegEx} ${fullURLregex}`);

/* eslint-disable */
// Types of logs
/* Type A
199.248.185.22 - [199.248.185.22] - - [22/Apr/2019:00:00:08 +0000] "GET /ils/pcubed/api/tenants/pcubed-uss/entries?bottleneck_uid=9085d32f-6963-4a31-9142-01ae48cd52ac&limit=100000&updated_since=2019-04-20T04:00:00.000Z HTTP/1.1" 200 42819 "-" "-" 873 0.062 [ils-prod-627b95751a3d-ils-bravos-8000] 100.105.161.41:8000 42819 0.063 200 f5b6ad8b53df73173e01eb918825e22b
*/

/* Type B
2019-04-22 00:00:07.801 [info]  200 71ms GET /ils/pcubed/api/tenants/pcubed-uss/entries?bottleneck_uid=b32768a8-2215-43d2-a7be-655de9ae3c9e&limit=100000&updated_since=2019-04-20T04:00:00.000Z → http://ils-pcubed-api:8000/tenants/pcubed-uss/entries?bottleneck_uid=b32768a8-2215-43d2-a7be-655de9ae3c9e&limit=100000&updated_since=2019-04-20T04:00:00.000Z [pcubed-uss-entry]
*/

/* Type C
4.31.139.175 - [4.31.139.175] - - [22/Apr/2019:00:00:00 +0000] "GET /ils/pcubed/api/tenants/pcubed-bimbo/sse_socket?subs=terry_clem,991c2b50-b541-11e5-818d-a5f9e20bbd05 HTTP/1.1" 503 22 "https://solutions.mckinsey.com/ils/pcubed/" "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36" 1913 120.004 [ils-prod-627b95751a3d-ils-bravos-8000] 100.105.161.41:8000 22 120.004 503 9c671b322ab6012bcc69dbc1bf7ee6ee
*/

/* Type D
2019-04-22 00:47:49.946 [info]  401 371µs POST /ils/pcubed/api/tenants/pcubed-dupont/entries × JSON Web Token Invalid []
*/

/* Type E
2019/04/22 00:38:30 [error] 57#57: *3074539 upstream prematurely closed connection while reading upstream, client: 199.248.185.22, server: ils-bravos-ui.mvp01.prod.nvt.mckinsey.cloud, request: "GET /ils/pcubed/api/tenants/pcubed-uss/sse_socket?subs=uss_84pkl,71dc7ed4-c2fd-4aae-a2f4-35c20d816de6 HTTP/1.1", upstream: "http://100.112.132.215:8000/ils/pcubed/api/tenants/pcubed-uss/sse_socket?subs=uss_84pkl,71dc7ed4-c2fd-4aae-a2f4-35c20d816de6", host: "ils-bravos-ui.mvp01.prod.nvt.mckinsey.cloud", referrer: "https://solutions.mckinsey.com/ils/pcubed/"
*/

/**
 * @typedef {string} API_URL
 */

/**
 * @typedef {string} LogData
 */

/**
 * @typedef {string} Timestamp
 */

/**
 * @typedef {{avgRespTime: number, noOfHits: number, respCodeMetrics: RespCodeMetrics }} APImetrics
 */

/**
 * @typedef {Object} SpecialError
 * @property {string} errorMessage
 * @property {string} client
 * @property {string} server
 * @property {string} upstream
 * @property {string} host
 * @property {string} referrer
 */

/**
 * @typedef {Object} APIdetails
 * @property {string} fullURL
 * @property {string} tenantName
 * @property {string} nonApiURL
 * @property {string} apiURL
 * @property {string} apiType
 * @property {string} method
 * @property {string} respCode
 * @property {string} respTime
 * @property {string} bottleneckUID
 * @property {string} plantUID
 * @property {string} orgUID
 * @property {string} lossReasonUID
 * @property {string} rawLog
 */

/**
 * @typedef {Map<API_URL, APImetrics>} APIanalysis
 */

/**
 * @typedef {{'200': number, '503': number, '400': number, '401': number, '304': number, '302': number, '404': number, '500': number, '403': number, 'NoResp': number}} RespCodeMetrics
 */
/* eslint-enable */
