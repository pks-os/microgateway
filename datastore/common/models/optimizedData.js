var async = require('async');
var debug = require('debug')('micro-gateway:data-store');

var ALLPLANS = 'ALLPLANS';
function createProductOptimizedEntry(app, ctx)
  {
  var locals = {};
  var product = ctx.instance
  locals.snapshot = ctx.instance['snapshot-id'];
  locals.subscription = {};  /// no subscription
  // assume we are going to create a wildcard entry...
  //     We will not if there's security configured at api level..
  locals.credentials = [{'client-id' : '', 'client-secret': ''}];
  var isWildcard = true;
  cycleThroughPlansInProduct(app, locals, isWildcard, product, ALLPLANS);
  }
  
function cycleThroughPlansInProduct(app, locals, isWildcard, product, planid, productCallback)
  {
  var plans = JSON.parse(JSON.stringify(product.document.plans));
  async.forEach(Object.getOwnPropertyNames(plans),
    function(propname, propCallback) 
      {
      //overwrite with specific entry
      locals.catalog = {};
      locals.product = product;
      locals.plan = {};
      locals.plan.apis = product.document.plans[propname].apis;
      locals.plan.name = propname;
      locals.plan.id = getPlanID(locals.product, propname);
      locals.plan.rateLimit =
        locals.product.document.plans[locals.plan.name]['rate-limit'];
      // 1. trying to add to a particular plan
      // 2. trying to add to all plans
      //    a. all subscription
      //    b. product that possibly doesn't have subs or security
      if (planid === ALLPLANS || locals.plan.id === planid)
        {
        gatherDataCreateOptimizedEntry(app, locals, isWildcard, propCallback); 
        }
      else
        {
        propCallback();
        }
      });
  if (productCallback)
    productCallback();
  }
  
function determineNeededSubscriptionOptimizedEntries(app, ctx)
  {
  var locals;
  locals = ripCTX(ctx);
  if (!process.env.APIMANAGER)
    {
    var planid = ctx.instance['plan-registration'].id;
    findPlansToAddSubscriptions(app, locals, planid)
    }
  else 
    {
    //specific subscription from APIm
    var isWildcard = false
    gatherDataCreateOptimizedEntry(app, locals, isWildcard);  
    }
  }
  
function findPlansToAddSubscriptions(app, passed, planid)
  {
  var isWildcard = false;
  var locals = passed;
  var productquery = {}; // look at all products
  // find optimized entries to create
  app.models.product.find(productquery, function(err, products) {
    async.forEach(products,
      function (product, productCallback) 
      {
      cycleThroughPlansInProduct(app, locals, isWildcard, product, planid, productCallback);
      });
    });
  }

function ripCTX(ctx)
  {
  var locals = {};
  locals.subscription = {};
  locals.subscription.id = ctx.instance.id;
  locals.credentials =
    ctx.instance.application['app-credentials'];
  locals.product = ctx.instance['plan-registration'].product;
  locals.plan = {};
  if (ctx.instance['plan-registration'].apis && ctx.instance['plan-registration'].plan)
    {
    locals.plan.apis = ctx.instance['plan-registration'].apis;
    locals.plan.plan = ctx.instance['plan-registration'].plan;
    locals.plan.id = getPlanID(locals.product, locals.plan.plan.name);
    locals.plan.name = locals.plan.plan.name;
    locals.plan.rateLimit =
      locals.product.document.plans[locals.plan.name]['rate-limit'];
    }
  locals.snapshot = ctx.instance['snapshot-id'];
  return locals;
  }
  
function getPlanID(product, planname)
  {
  debug('product.document.info.name + ":" + product.document.info.version + ":" + planname: ' + 
    JSON.stringify(product.document.info.name + ":" + product.document.info.version + ":" + planname, null, 4));
  return product.document.info.name + ":" + product.document.info.version + ":" + planname;
  }

function gatherDataCreateOptimizedEntry(app, locals, isWildcard, gatherCallback)
  {
  async.series(
    [
      function(callback) {
        grabCatalog(app,
          locals.snapshot,
          locals.product,
          function(err, catalog) {
            if (err) {
              callback(err);
              return;
            }
            locals.catalog = catalog;
            callback();
          }
        );
      },
      function(callback) {
        grabOrg(app,
          locals.snapshot,
          locals.catalog,
          function(err, org) {
            if (err) {
              callback(err);
              return;
            }
            locals.org = org;
            callback();
          }
        );
      },
      function(callback) {
        grabAPIs(app,
          locals.snapshot,
          locals.plan,
          function(err, apis) {
            if (err) {
              callback(err);
              return;
            }
            locals.apis = apis;
            callback();
          }
        );
      },
      function(callback) {
        createOptimizedDataEntry(
          app,
          locals,
          isWildcard,
          function(err) {
            if (err) {
              callback(err);
              return;
            }
            callback();
          }
        );
      }
    ],
    function(err, results) {
      if (err) {
        console.error(err);
      }
      if (gatherCallback)
        gatherCallback();
    }
  );
}

function grabCatalog(app, snapshot, product, cb) {
  var catalog = {};
  var query = {
    'where' : {
        'snapshot-id' : snapshot,
        'id' : product.id
    }
  };
  app.models.product.findOne(query, function(err, myproduct) {
      if (err) {
        cb(err);
        return;
      }
      catalog = myproduct.catalog;
      cb(null, catalog);
    }
  );
}


function grabOrg(app, snapshot, catalog, cb) {
  var org = {};
  var query = {
    'where' : {
        'snapshot-id' : snapshot,
        'id' : catalog.id
    }
  };
  app.models.catalog.findOne(query, function(err, mycatalog) {
      if (err) {
        cb(err);
        return;
      }
      if (mycatalog)
        org = mycatalog.organization;
      else {org={};}
      cb(null, org);
    }
  );
}


function grabAPIs(app, snapshot, plan, cb) {
  var apis = [];
  debug('found plan: %j', plan);
  async.each(
    plan.apis,
    function(api, done) {
      var query = {
        'where' : {
          'snapshot-id' : snapshot
        }
      };
      app.models.api.find(
        query,
        function(err, listOfApis) {
          if (err) {
            done(err);
            return;
          }
          listOfApis.forEach(function(DBapi) {
            var info = {};
            if (api.document)
              {info = api.document.info;}
            else
              if (api.info) // standard (not in document)
                {info = api.info;}
              else
                { // not resolved try to spit the name
                var apiName = api['$ref'].split(':');
                debug('apiName: %j', apiName);
                info = {'x-ibm-name': apiName[0], 'version': apiName[1]}
                }

            if (DBapi.document.info['version'] ===
              info['version'] &&
              DBapi.document.info['x-ibm-name'] ===
              info['x-ibm-name']) {
                debug('found api in db: %j', DBapi);
                apis.push(DBapi);
                }
            
          });
          done();
        }
      );
    },
    function(err) {
      cb(err, apis);
    }
  );
}


function createOptimizedDataEntry(app, pieces, isWildcard, cb) {
  async.each(
    pieces.credentials,
    function(credential, creddone) { //each clientid
      async.each(
        pieces.apis,
        function(api, apidone) {  // each api
          var apiPaths = [];
          var pathsProp = JSON.parse(JSON.stringify(api.document['paths']));
          debug('pathsProp ' +
                Object.getOwnPropertyNames(pathsProp));
          Object.getOwnPropertyNames(pathsProp).forEach(
            function(propname) {
              var method = [];
              if (propname.indexOf('/') > -1) {
                debug('propname: ' + propname);
                var propnames = JSON.parse(JSON.stringify(api.document.paths[propname]));
                Object.getOwnPropertyNames(
                  propnames).forEach(
                  function(methodname) {
		                var operation = propnames[methodname];
                    debug('propname method: %j',
                      methodname);
                    debug('propname operationId: %j',
                      operation.operationId);
                    var securityEnabledForMethod = 
                      operation.security ? operation.security : api.document.security;
                    if ((securityEnabledForMethod && !isWildcard) || 
                        // add only security for subscriptions
                        (!securityEnabledForMethod && isWildcard)) 
                        // add only non-security for products (wildcard)
                      {
                      method.push({
                        method: methodname.toUpperCase(),
                        operationId: operation.operationId,
                        securityDefs: api.document.securityDefinitions,
                        // operational lvl Swagger security overrides the API lvl
                        securityReqs: securityEnabledForMethod,
                        });
                      }
                  }
                );
                if (method.length !== 0) // no methods, no apiPaths
                  {
                  var regexPath = makePathRegex(
                            api.document.basePath,
                            propname);
                  var apiPath = {
                    path: propname,
                    'matching-score':
                      calculateMatchingScore(propname),
                    'path-regex': regexPath,
                    'path-methods': method
                    };
                  apiPaths.push(apiPath);
                  }
              }
            }
          );

    /*
        "subscription-id": "string",
        "client-id": "string",
        "catalog-id": "string",
        "catalog-name": "string",
        "organization-id": "string",
        "organization-name": "string",
        "product-id": "string",
        "product-name": "string",
        "plan-id": "string",
        "plan-name": "string",
        "plan-rate-limit": {},
        "api-id": "string",
        "api-base-path": "string",
        "api-paths": [{
           "path": "string",
           "path-base": "string",
           "path-methods": [
              ]
          }],
         TODO: "snapshot-id": "string"
        */
          debug('pieces: ' + JSON.stringify(pieces,null,4));
          var newOptimizedDataEntry = {
            'subscription-id': pieces.subscription.id,
            'client-id': credential['client-id'],
            'client-secret': credential['client-secret'],
            'plan-id': pieces.plan.id,
            'plan-name': pieces.plan.name,
            'plan-rate-limit': pieces.plan.rateLimit,
            'product-id': pieces.product.id,
            'product-name': pieces.product.document.info.name,
            'catalog-id': pieces.catalog.id,
            'catalog-name': pieces.catalog.name,
            'organization-id': pieces.org.id,
            'organization-name': pieces.org.name,
            'api-id': api.id,
            'api-base-path': api.document.basePath,
            'api-paths': apiPaths,
            'snapshot-id' : pieces.snapshot
          };

        if (apiPaths.length !== 0) // no paths, no entry..
          {
          app.models.optimizedData.create(
            newOptimizedDataEntry,
            function(err, optimizedData) {
              if (err) {
                apidone(err);
                return;
              }
              debug('optimizedData created: %j',
                  optimizedData);
              apidone();
            }
          );
          }
        else 
          {
          apidone();
          }
        },
        function(err) {
          creddone(err);
        }
      );
    },
    function(err) {
      cb(err);
    }
  );
}

function makePathRegex(basePath, apiPath) {
  var path = apiPath;
  debug('path: ', path);
  var braceBegin = -1;
  var braceEnd = -1;
  do {
    braceBegin = path.indexOf('{');
    if (braceBegin >= 0) {
      braceEnd = path.indexOf('}') + 1;
      var variablePath = path.substring(braceBegin, braceEnd);
      path = path.replace(variablePath, '.*');
    }
  } while (braceBegin >= 0);
  path = '^' + basePath + path + '$';
  debug('path after: ', path);
  return path;
}

function calculateMatchingScore(apiPath) {
  var pathArray = apiPath.split('/');
  var pathScore = 0;
  for (var i=1; i < pathArray.length; i++) {
    if (pathArray[i].indexOf('{') >= 0) {
      pathScore += i;
    }
  }

  return pathScore;
}

exports.determineNeededSubscriptionOptimizedEntries = determineNeededSubscriptionOptimizedEntries;
exports.createProductOptimizedEntry = createProductOptimizedEntry;
