'use strict';
/*global require, module, Buffer, jsGen*/

/*
    convertID(id);
    getPoisNum(callback);
    getLatestId(callback);
    getPoisList(_idArray, callback);
    getPoi(_id, callback);
    setPoi(poiObj, callback);
    setNewPoi(poiObj, callback);
    delPoi(_idArray, callback);
 */
var noop = jsGen.lib.tools.noop,
    union = jsGen.lib.tools.union,
    intersect = jsGen.lib.tools.intersect,
    IDString = jsGen.lib.json.IDString,
    defautPoi = jsGen.lib.json.Poi,
    callbackFn = jsGen.lib.tools.callbackFn,
    wrapCallback = jsGen.lib.tools.wrapCallback,
    converter = jsGen.lib.converter,
    pois = jsGen.dao.db.bind('pois');

pois.bind({

    convertID: function (id) {
        switch (typeof id) {
        case 'string':
            id = id.substring(1);
            return converter(id, 62, IDString);
        case 'number':
            id = converter(id, 62, IDString);
            while (id.length < 3) {
                id = '0' + id;
            }
            return 'P' + id;
        default:
            return null;
        }
    },

    getPoisNum: function (callback) {
        this.count(wrapCallback(callback));
    },

    getLatestId: function (callback) {
        callback = callback || callbackFn;
        this.findOne({}, {
            sort: {
                _id: -1
            },
            hint: {
                _id: 1
            },
            fields: {
                _id: 1
            }
        }, callback);
    },

    getPoisIndex: function (callback) {
        callback = callback || callbackFn;
        this.find({}, {
            sort: {
                _id: 1
            },
            hint: {
                _id: 1
            },
            fields: {
                _id: 1,
                poi: 1,
                articles: 1,
                users: 1
            }
        }).each(callback);
    },

    getPoi: function (_id, callback) {
        this.findOne({
            _id: +_id
        }, {
            sort: {
                _id: -1
            },
            fields: {
                poi: 1,
                articles: 1,
                articlesList: 1,
                users: 1,
                usersList: 1
            }
        }, wrapCallback(callback));
    },

    setPoi: function (poiObj, callback) {
        var setObj = {},
            newObj = {
                poi: 0,
                articlesList: 0,
                usersList: 0
            };
        newObj = intersect(newObj, poiObj);
        if (newObj.poi) {
            setObj.$set = {
                poi: newObj.poi
            };
        } else if (newObj.articlesList) {
            console.log('setPoi articlesList 0:' + newObj.articlesList);
            if (newObj.articlesList < 0) {
                newObj.articlesList = -newObj.articlesList;
                setObj.$inc = {
                    articles: -1
                };
                setObj.$pull = {
                    articlesList: newObj.articlesList
                };
                console.log('setPoi articlesList 1:' + setObj.articlesList);
            } else {
                setObj.$inc = {
                    articles: 1
                };
                setObj.$push = {
                    articlesList: newObj.articlesList
                };
            }
        } else if (newObj.usersList) {
            if (newObj.usersList < 0) {
                newObj.usersList = -newObj.usersList;
                setObj.$inc = {
                    users: -1
                };
                setObj.$pull = {
                    usersList: newObj.usersList
                };
            } else {
                setObj.$inc = {
                    users: 1
                };
                setObj.$push = {
                    usersList: newObj.usersList
                };
            }
        }

        if (callback) {
            this.findAndModify({
                _id: poiObj._id
            }, [], setObj, {
                w: 1,
                'new': true
            }, wrapCallback(callback));
        } else {
            this.update({
                _id: poiObj._id
            }, setObj, noop);
        }
    },

    setNewPoi: function (poiObj, callback) {
        console.log('setNewPoi poi:' + poiObj.poi);
        var that = this,
            poi = union(defautPoi),
            newPoi = union(defautPoi);
        callback = callback || callbackFn;

        newPoi = intersect(newPoi, poiObj);
        newPoi = union(poi, newPoi);

        console.log('setNewPoi poi:' + newPoi.poi);
        this.getLatestId(function (err, doc) {
            if (err) {
                return callback(err, null);
            }
            if (!doc) {
                newPoi._id = 1;
            } else {
                newPoi._id = doc._id + 1;
            }
            that.findAndModify({
                _id: newPoi._id
            }, [], newPoi, {
                w: 1,
                upsert: true,
                'new': true
            }, wrapCallback(callback));
        });
    },

    delPoi: function (_id, callback) {
        this.remove({
            _id: +_id
        }, {
            w: 1
        }, wrapCallback(callback));
    }
});

module.exports = {
    convertID: pois.convertID,
    getPoisNum: pois.getPoisNum,
    getLatestId: pois.getLatestId,
    getPoisIndex: pois.getPoisIndex,
    getPoi: pois.getPoi,
    setPoi: pois.setPoi,
    setNewPoi: pois.setNewPoi,
    delPoi: pois.delPoi
};