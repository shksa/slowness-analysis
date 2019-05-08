/* eslint-disable no-useless-escape */
const csv = require('csv');
const fs = require('fs');
const assert = require('assert');

const csvParser = csv.parse();

const csvFileReadStream = fs.createReadStream(
  './dataset/pcubed-logs-22-00-to-22-01-lean.csv',
);

const csvParserWithReadStream = csvFileReadStream.pipe(csvParser);

const output = [];

/**
 * @typedef {string} APItype
 */

/**
 * @typedef {number} RespTime
 */

/**
 * @typedef {number} NoOfHits
 */

/**
 * @type {Map<APItype, {respTime: string, noOfHits: number}>}
 */
const apiRespTimeTable = new Map()

csvParserWithReadStream
  .on('readable', () => {
    let record;
    // eslint-disable-next-line no-cond-assign
    while ((record = csvParserWithReadStream.read())) {
      assert.strictEqual(record.length, 2);
      const apiDetails = getAPIdetails(record[0]);
      // const prevAvgTime = apiRespTimeTable.get(apiDetails.apiType)
      // apiRespTimeTable.set(apiDetails.apiType)
      output.push([apiDetails, record[1]]);
    }
  })
  .on('error', (err) => {
    console.error('some error occurred: ', err.message);
  })
  .on('end', () => {
    console.log('Reading csv ended. No of rows read:', output.length);
    console.log(output)
  });

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
 * @property {string} url
 * @property {string} tenantName
 * @property {string} apiType
 * @property {string} apiTypeTenantAgnostic
 * @property {string} method
 * @property {string} [respCode]
 * @property {string} [respTime]
 * @property {string} bottleneckUID
 * @property {string} plantUID
 * @property {string} orgUID
 * @property {string} lossReasonUID
 * @property {SpecialError} [specialError]
 * @property {string} rawLog
 */

/**
 *
 * @param {string} log
 * @returns {APIdetails} apiDetails
 */
function getAPIdetails(log) {
  // console.log(log)
  /**
   * @type {APIdetails}
   */
  let apiDetails;
  const matchResult = log.match(headerRegEx)
    || log.match(logTypeAorCregex)
    || log.match(logTypeBorDregex)
    || log.match(logTypeEregex)
    || log.match(logTypeFregex);

  if (!matchResult) {
    throw Error(
      `Did not match any regex for ------->${log}<--------, build new one`,
    );
  }

  const matchedGroups = matchResult.groups;

  if (!matchedGroups) {
    return null;
  } if (matchedGroups.errorMessage) {
    apiDetails = handleSpecialError(matchedGroups);
  } else {
    // @ts-ignore
    apiDetails = matchedGroups;
  }
  apiDetails.bottleneckUID = matchedGroups.bottleneckUIDForEorT || matchedGroups.bottleneckUIDForB || matchedGroups.optBottleneckUID;
  apiDetails.rawLog = log
  // console.log(apiDetails);

  return apiDetails;
}

function handleSpecialError(matchedGroups) {
  /**
   * @type {SpecialError}
   */
  const specialError = {};
  specialError.client = matchedGroups.client;
  specialError.errorMessage = matchedGroups.errorMessage;
  specialError.host = matchedGroups.host;
  specialError.referrer = matchedGroups.referrer;
  specialError.server = matchedGroups.server;
  specialError.upstream = matchedGroups.upstream;
  /**
   * @type {APIdetails}
   */
  const apiDetails = {};
  apiDetails.method = matchedGroups.method;
  apiDetails.url = matchedGroups.url;
  apiDetails.apiType = matchedGroups.apiType;
  apiDetails.apiTypeTenantAgnostic = matchedGroups.apiTypeTenantAgnostic;
  apiDetails.tenantName = matchedGroups.tenantName;
  apiDetails.plantUID = matchedGroups.plantUID;
  apiDetails.lossReasonUID = matchedGroups.lossReasonUID;
  apiDetails.orgUID = matchedGroups.orgUID;
  apiDetails.specialError = specialError;
  return apiDetails;
}

const UIDregex = '[A-F0-9a-f]{8}(?:-[A-F0-9a-f]{4}){3}-[A-F0-9a-h]{12}'

const bottleneckUIDregexForEorT = `(?<bottleneckUIDForEorT>${UIDregex})`

const bottleneckUIDForB = `(?<bottleneckUIDForB>${UIDregex})`

const optBottleneckUIDregex = `(?<optBottleneckUID>${UIDregex})`

const plantUIDregex = `(?<plantUID>${UIDregex})`

const lossReasonUIDregex = `(?<lossReasonUID>${UIDregex})`

const orgUID = '(?<orgUID>\\w*)'

const apiTypeRegEx = `(?<apiType>(?<tenantName>\\S+)\\/(?<apiTypeTenantAgnostic>(entries|targets)\\?bottleneck_uid=${bottleneckUIDregexForEorT}|sse_socket\\?subs|data_entry|logo|client_languages|clients|entries|bottlenecks|network|sub_losses|last_updated|global_losses\\?raw|loss_types\\?plant_uid=${plantUIDregex}|loss_reasons\\?opt_bottleneck_uid=${optBottleneckUIDregex}|loss_reasons\\?loss_reason_guid=${lossReasonUIDregex}|projects\\?organization_uid=${orgUID}|watches\\?raw|bottlenecks\\/${bottleneckUIDForB}))`

const headerRegEx = /record\.log/;

const methodRegEx = '(?<method>GET|POST|PUT|DELETE|PATCH)';

const urlRegEx = `(?<url>\\/ils\\/pcubed\\/api\\/tenants\\/${apiTypeRegEx}.*)`;

const httpVerRegEx = '(?<httpVer>HTTP\\/\\d\\.\\d")';

const respCodeRegEx = '(?<respCode>\\d{3})';

const respTimeRegEx = '(?<respTime>\\d*\\S?s?)';

const trailingRegex = '(?<garbage>"-"|"https:|→|× JSON)';

const logTypeAorCregex = new RegExp(
  `${methodRegEx} ${urlRegEx} ${httpVerRegEx} ${respCodeRegEx} ${respTimeRegEx} ${trailingRegex}`,
);

const logTypeBorDregex = new RegExp(
  `${respCodeRegEx} ${respTimeRegEx} ${methodRegEx} ${urlRegEx} ${trailingRegex}`,
);

const logTypeEregex = new RegExp(
  `\\[error\\] \\d*#\\d*: (?<errorMessage>.*), client: (?<client>.*), server: (?<server>.*), request: "${methodRegEx} ${urlRegEx} ${httpVerRegEx}, upstream: "(?<upstream>.*)", host: "(?<host>.*)", referrer: "(?<referrer>.*)"`,
);
// const logTypeEregEx = /\[error\] \d*#\d*: .*/;

const logTypeFregex = new RegExp(`Request: ${methodRegEx} ${urlRegEx}`);

// const trailingGarbageRegex = /( (→|× JSON)|("-"|"https:))/;

// const API_URL_REGEXs = [
//   /\/ils\/pcubed\/api\/tenants\/\w*-\w*\/sse_socket.* HTTP\/\d\.\d/,
//   /\/ils\/pcubed\/api\/tenants\/\w*-\w*\/data_entry.* HTTP\/\d\.\d/,
//   /\/ils\/pcubed\/api\/tenants\/\w*-\w*\/entries?bottleneck_uid=.* HTTP\/\d\.\d/,
//   /\/ils\/pcubed\/api\/tenants\/\w*-\w*\/targets?bottleneck_uid=.* HTTP\/\d\.\d/,
// ]

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

const roughWork = `
// const sanitizedLog = log.replace(/"https:\/\/solutions.mckinsey.com\/ils\/pcubed\/.*/, '')
//   .replace(/Mozilla\/\d\.\d.*/, '')
//   .replace(/(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g, '')
//   .replace(' - [] - - ', '')
// const sanitizedLog = log.replace(/Mozilla\/\d{1,4}.\d{1,4}/, '')
//   .replace(/\(Windows NT \d.\d\)/, '')
//   .replace(/AppleWebKit\/\d{1,4}.\d{1,4}/, '')
//   .replace(/\(KHTML, like Gecko\)/, '')
//   .replace(/Chrome\/\d{1,4}.\d{1,4}.\d{1,4}.\d{1,4}/, '')
//   .replace(/Safari\/\d{1,4}.\d{1,4}/, '')
//   .replace(/(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g, '')
//   .replace(' - [] - - ', '')
`;
/* eslint-enable */
