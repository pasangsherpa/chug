var assert = require('assert-plus');
var chug = require('../chug');
var Waiter = require('../lib/Waiter');

describe('Waiter', function () {
  before(function () {
    chug.waitCount = 0;
    chug.isReady = false;
    chug.onceReadyQueue = [];
    chug.onReadyQueue = [];
  });
  describe('wait/unwait', function() {
    it('should increment/decrement', function () {
      var w = new Waiter();
      w.wait();
      assert.equal(w.waitCount, 1);
      assert.equal(w.isReady, false);
      w.wait();
      assert.equal(w.waitCount, 2);
      w.unwait();
      assert.equal(w.waitCount, 1);
      assert.equal(w.isReady, false);
      w.unwait();
      assert.equal(w.waitCount, 0);
      assert.equal(w.isReady, true);
      w.isReady = false;
    });
  });
  describe('onceReady', function() {
    var w = new Waiter();
    it('should have a method', function () {
      assert.func(w.onceReady);
    });
    it('should have a queue', function () {
      assert.object(w.onceReadyQueue);
      w.onceReady(function() { });
      assert.equal(w.onceReadyQueue.length, 1);
    });
    it('should execute callbacks', function () {
      var calls = 0;
      var callback = function () {
        calls++;
      };
      // A call isn't made initially because isReady == false.
      w.onceReady(callback);
      assert.equal(calls, 0);

      // Starting an async call doesn't cause a call to execute.
      w.wait();
      assert.equal(calls, 0);

      // Async calls are in progress, so callbacks won't execute.
      w.onceReady(callback);
      assert.equal(calls, 0);

      // Once async calls finish, callbacks will execute.
      w.unwait();
      assert.equal(calls, 2);

      // Initial load is completed, so callbacks execute immediately.
      w.onceReady(callback);
      assert.equal(calls, 3);
    });
  });
  describe('onReady', function() {
    var w = new Waiter();
    it('should have a method', function () {
      assert.func(w.onReady);
    });
    it('should have a queue', function () {
      assert.object(w.onReadyQueue);
      w.onReady(function() { });
      assert.equal(w.onReadyQueue.length, 1);
    });
    it('should execute callbacks', function () {
      var calls = 0;
      var callback = function () {
        calls++;
      };
      // A call isn't made initially because isReady == false.
      w.onReady(callback);
      assert.equal(calls, 0);

      // Starting an async call doesn't cause a call to execute.
      w.wait();
      assert.equal(calls, 0);

      // Async calls are in progress, so callbacks won't execute.
      w.onReady(callback);
      assert.equal(calls, 0);

      // Once async calls finish, callbacks will execute.
      w.unwait();
      assert.equal(calls, 2);

      // Initial load is completed, so callbacks execute immediately.
      w.onReady(callback);
      assert.equal(calls, 3);

      // When the waiter becomes ready again, everything should re-execute.
      w.wait();
      w.unwait();
      assert.equal(calls, 6);
    });
  });
  describe('addParent', function() {
    it('should link wait counts', function (done) {
      var parent = new Waiter();
      var child = new Waiter();
      child.wait(2);
      child.addParent(parent);
      assert.equal(parent.waitCount, 2);
      parent.onceReady(done);
      child.unwait(2);
    });
  });
});