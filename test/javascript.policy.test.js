'use strict';
const javascriptPolicy = require('../policies/javascript')();
const should           = require('should');

describe('javascript policy', function() {
  describe('access context', function() {
    // read/access context
    it('should be able to read a property in the context', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `if (request.uri === undefined ||
                    request.uri !== "http://localhost/foo") {
                    throw {name:'PropertyNotFound'};
                  }`;
      javascriptPolicy({source: code}, context, error => {
        should(error).be.a.Undefined();
        done();
      });
    });

    // update properties in context
    it('should be able to update a property in the context', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `request.uri = 'http://localhost/bar';`;
      javascriptPolicy({source: code}, context, error => {
        context.request.uri.should.exactly('http://localhost/bar');
        done();
      });
    });

    // delete properties in context
    it('should be able to delete a property in the context', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `delete request.uri;`;
      javascriptPolicy({source: code}, context, error => {
        should(context.request.uri).be.a.Undefined();
        done();
      });
    });

    it('should not pollute context with local variable', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `var a = 'localvar'; a = request.uri;`;
      javascriptPolicy({source: code}, context, error => {
        should(context.a).be.a.Undefined();
        done();
      });
    });

  });

  describe('verify capabilities', function() {
    // create/call a function
    it('should be able to add/call function', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `function fool(bar) {
          return bar+'xxx';
        }
        request.uri = fool('http://localhost/');
        `;

      javascriptPolicy({source: code}, context, error => {
        context.request.uri.should.exactly('http://localhost/xxx');
        done();
      });
    });

    // use global functions
    it('should be able to use ECMA function: parseInt()', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'},
                     myval : "1"
                     };
      var code = `myval = parseInt(myval);`;

      javascriptPolicy({source: code}, context, error => {
        should(context.myval).exactly(1).and.be.a.Number();
        done();
      });
    });

    // use JSON.stringify functions
    it('should be able to use ECMA function: parseInt()', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'},
                     myval : "1"
                     };
      var code = `myval = JSON.stringify({ 'a': 'a', 'b':'b'});`;

      javascriptPolicy({source: code}, context, error => {
        should(context.myval).exactly(JSON.stringify({ 'a': 'a', 'b':'b'})).
          and.be.a.String();
        done();
      });
    });

    // no require
    it('should not be able to call require()', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `var vm = require('vm');`;

      javascriptPolicy({source: code}, context, error => {
        error.name.should.exactly('ReferenceError');
        done();
      });
    });

    // no process
    it('should not be able to use process', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `process.env;`;

      javascriptPolicy({source: code}, context, error => {
        error.name.should.exactly('ReferenceError');
        done();
      });
    });

    // no setTimeout
    it('should not be able to use setTimeout', function(done) {
      var context = {request:
                          {uri: 'http://localhost/foo'}
                     };
      var code = `setTimeout(()=>{request.uri='xxx';}, 1000);`;

      javascriptPolicy({source: code}, context, error => {
        error.name.should.exactly('ReferenceError');
        done();
      });
    });

  });
});