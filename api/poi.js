'use strict';
/*global require, module, Buffer, jsGen*/

var msg = jsGen.lib.msg,
    request = jsGen.lib.request,
    MD5 = jsGen.lib.tools.MD5,
    each = jsGen.lib.tools.each,
    union = jsGen.lib.tools.union,
    resJson = jsGen.lib.tools.resJson,
    toArray = jsGen.lib.tools.toArray,
    checkID = jsGen.lib.tools.checkID,
    intersect = jsGen.lib.tools.intersect,
    filterPoi = jsGen.lib.tools.filterPoi,
    removeItem = jsGen.lib.tools.removeItem,
    errorHandler = jsGen.lib.tools.errorHandler,
    paginationList = jsGen.lib.tools.paginationList,
    parseJSON = jsGen.lib.tools.parseJSON,
    poiDao = jsGen.dao.poi,
    redis = jsGen.lib.redis,
    then = jsGen.module.then,
    poiCache = jsGen.cache.poi,
    cache = jsGen.lib.redis.poiCache,
    paginationCache = jsGen.cache.pagination;

poiCache.getP = function (ID) {
    var that = this,
        inCache = false;

    return then(function (defer) {
        if (ID >= 0) {
            var poi = that.get(ID);
            if (poi) {
                inCache = true;
                return defer(null, poi);
            } else {
                return poiDao.getPoi(ID, defer);
            }
        } else {
            defer(jsGen.Err(msg.POI.poiNone));
        }
    }).then(function (defer, poi) {
        if (!inCache) {
            that.put(ID, poi);
        }
        defer(null, poi);
    }).fail(errorHandler);
};


function convertPois(IDArray, idd) {
    return then.each(toArray(IDArray), function (defer, x) {
        cache(x, function (err, poi) {
            poi = poi && {
                _id: poiDao.convertID(poi._id),
                poi: poi.poi,
                articles: poi.articles,
                users: poi.users
            };
            defer(null, poi || null);
        });
    }).all(function (defer, err, list) {
        removeItem(list, null);
        defer(null, list);
    });
}

function setPoi(poiObj) {
    var setKey = null;

    return then(function (defer) {
        if (!poiObj || !poiObj._id) {
            defer(true);
        } else if (poiObj.poi) {
            setKey = 'poi';
        } else if (poiObj.articlesList) {
            setKey = 'articlesList';
        } else if (poiObj.usersList) {
            setKey = 'usersList';
        }
        cache(poiObj._id, defer);
    }).then(function (defer, poi) {
        if (setKey === 'poi') {
            then(function (defer2) {
                if (poiObj.poi === poi.poi) {
                    defer(true);
                } else {
                    cache.get(poiObj.poi, defer2);
                }
            }).all(function (defer2, err, ID) {
                if (!err && ID !== poiObj._id) {
                    defer2(null, ID);
                } else {
                    defer2(true);
                }
            }).then(function (defer2, toID) {
                poiCache.getP(poiObj._id).then(function (defer3, poi) {
                    then.each(poi.articlesList, function (defer4, x) {
                        if (x) {
                            setPoi({
                                _id: toID,
                                articlesList: x
                            });
                            jsGen.cache.list.getP(x, false).then(function (defer5, article) {
                                removeItem(article.poisList, poiObj._id);
                                if (article.poisList.indexOf(toID) < 0) {
                                    article.poisList.push(toID);
                                    jsGen.cache.list.put(article._id, article);
                                    jsGen.cache.article.update(article._id, function (value) {
                                        value.poisList = article.poisList;
                                        return value;
                                    });
                                    jsGen.dao.article.setArticle({
                                        _id: x,
                                        poisList: article.poisList
                                    });
                                }
                            });
                        }
                        defer4();
                    }).each(poi.usersList, function (defer4, x) {
                        if (x) {
                            setPoi({
                                _id: toID,
                                usersList: x
                            });
                            jsGen.cache.user.getP(x, false).then(function (defer5, user) {
                                removeItem(user.poisList, poiObj._id);
                                if (user.poisList.indexOf(toID) < 0) {
                                    user.poisList.push(toID);
                                    jsGen.cache.user.put(user._id, user);
                                    jsGen.dao.user.setUserInfo({
                                        _id: x,
                                        poisList: user.poisList
                                    });
                                }
                            });
                        }
                        defer4();
                    });
                    poiDao.delPoi(poiObj._id, defer3);
                }).then(function (defer3) {
                    poiCache.remove(poiObj._id);
                    cache.remove(poiObj._id);
                    poiCache.getP(toID).all(defer);
                }).fail(defer);
            }, function (defer2) {
                poiDao.setPoi(poiObj, function (err, poi) {
                    if (poi) {
                        cache.update(poi);
                        poiCache.put(poi._id, poi);
                    }
                    defer(err, poi);
                });
            }).fail(defer);
        } else if (setKey === 'articlesList' || setKey === 'usersList') {
            poiCache.getP(poiObj._id).then(function (defer2, poi) {
                var exist = poi[setKey].indexOf(Math.abs(poiObj[setKey]));
                if ((poiObj[setKey] < 0 && exist >= 0) || (poiObj[setKey] > 0 && exist < 0)) {
                    poiDao.setPoi(poiObj, defer2);
                } else {
                    defer2(true);
                }
            }).then(function (defer2, poi) {
                cache.update(poi);
                poiCache.put(poi._id, poi);
            }).fail(defer);
        } else {
            defer(true);
        }
    }).fail(function (defer, err) {
        defer(err === true ? jsGen.Err(msg.MAIN.requestDataErr) : err);
    });
}

function filterPois(poiid) {
    return then(function (defer) {
        console.log('filterPois poi:' + poiid);
        if (poiid) {
            then(function (defer2) {
                cache.get(poiid, defer2);
            }).then(function (defer2, ID) {
                console.log('filterPois ID:' + ID);
                defer(null, ID);
            }, function (defer2, err) {
                console.log('filterPois poiid:' + poiid);
                poiDao.setNewPoi({
                    poi: poiid
                }, function (err, poi) {
                    defer(null, poi ? (cache.update(poi), poi._id) : null);
                });
            });
        } else {
            defer(null, null);
        }
    }).then(function (defer, ID) {
        removeItem(ID, null);
        defer(null, ID);
    });
}

function getPoiID(req) {
    var poi = decodeURI(req.path[2]);
    return then(function (defer) {
        if (checkID(poi, 'P')) {
            defer(null, poiDao.convertID(poi));
        } else {
            cache.get(poi, function (err, ID) {
                defer(err ? jsGen.Err(msg.POI.poiNone) : null, ID);
            });
        }
    }).then(function (defer, ID) {
        cache(ID, defer);
    }).fail(errorHandler);
}

function getPoi(req, res) {
    var poi,
        p = +req.getparam.p || +req.getparam.pageIndex || 1;
    console.log('getPoi 0');
    req.session.paginationKey = req.session.paginationKey || {};
    console.log('getPoi 1');
    getPoiID(req).then(function (defer, doc) {
        console.log('getPoi 2');
        var key = 'Poi' + doc.poi,
            list = paginationCache.get(req.session.paginationKey[key]);
        console.log('getPoi key： ' + key);
        poi = doc;
        if (!list || p === 1) {
            then(function (defer2) {
                poiCache.getP(poi._id).all(defer2);
            }).then(function (defer2, poi) {
                list = poi.articlesList;
                req.session.paginationKey[key] = MD5(JSON.stringify(list.slice(0, 100)), 'base64');
                paginationCache.put(req.session.paginationKey[key], list);
                defer(null, list);
            }).fail(defer);
        } else {
            defer(null, list);
        }
    }).then(function (defer, list) {
        paginationList(req, list, jsGen.cache.list, defer);
    }).then(function (defer, data, pagination) {
        poi._id = poiDao.convertID(poi._id);
        console.log('getPoi key： ' + poi._id);
        return res.sendjson(resJson(null, data, pagination, {
            poi: poi
        }));
    }).fail(res.throwError);
}

function getLocPois(req, res) {
    var data,
        location = req.getparam.location;
    console.log(req.getparam.location);
    var poisapi = 'http://apis.map.qq.com/ws/geocoder/v1/?location=' + location  + '&key=OPMBZ-42M3D-72S4R-PZZ4H-K7YVF-VMFLD&get_poi=1';
    console.log(poisapi);
    then(function (defer) {
        /* 暂时不要求登录
         if (!req.session.Uid) {
         defer(jsGen.Err(msg.USER.userNeedLogin));
         } else {
         userCache.getP(req.session.Uid, false).all(defer);
         }
         */
        request(poisapi, function(error, response, body) {
            data = parseJSON(body);
            console.log(data.result.pois);
            res.sendjson(data.result.pois);
        });
    }).fail(res.throwError);
}

function getPois(req, res) {
    var list,
        s = +req.path[3],
        p = +req.getparam.p || +req.getparam.pageIndex || 1,
        listPagination = req.session.listPagination;

    then(function (defer) {
        cache.index(0, -1, defer);
    }).then(function (defer, list) {
        paginationList(req, list, poiCache, defer);
    }).then(function (defer, data, pagination) {
        each(data, function (poi) {
            poi._id = poiDao.convertID(poi._id);
            delete poi.articlesList;
            delete poi.usersList;
        });
        return res.sendjson(resJson(null, data, pagination));
    }).fail(res.throwError);
}

function editPois(req, res) {
    var defaultObj = {
        _id: '',
        poi: ''
    },
        result = {};

    then(function (defer) {
        if (!req.session.role || req.session.role < 4) {
            defer(jsGen.Err(msg.USER.userRoleErr));
        } else {
            defer(null, toArray(req.apibody.data));
        }
    }).each(null, function (defer, x) {
            x = intersect(union(defaultObj), x);
            x._id = poiDao.convertID(x._id);
            setPoi(x).all(function (defer, err, poi) {
                if (poi) {
                    poi._id = poiDao.convertID(poi._id);
                    delete poi.articlesList;
                    delete poi.usersList;
                    result[poi._id] = poi;
                }
                defer();
            });
    }).then(function (defer) {
        res.sendjson(resJson(null, result));
    }).fail(res.throwError);
}

function delPoi(req, res) {
    var ID;
    getPoiID(req).then(function (defer, poi) {
        if (req.session.role !== 5) {
            defer(jsGen.Err(msg.USER.userRoleErr));
        } else {
            ID = poi._id;
            poiDao.delPoi(ID, defer);
        }
    }).then(function (defer) {
        poiCache.remove(ID);
        cache.remove(ID);
        return res.sendjson(resJson());
    }).fail(res.throwError);
}



module.exports = {
    GET: function (req, res) {
        console.log('poi.js: ' + req.path[2]);
        switch (req.path[2]) {
        case undefined:
        case 'index':
        case 'hots':
            return getPois(req, res);
        case 'pois':
            return getLocPois(req, res);
        default:
            return getPoi(req, res);
        }
    },
    POST: function (req, res) {
        switch (req.path[2]) {
        case undefined:
        case 'index':
            return getPois(req, res);
        case 'admin':
            return editPois(req, res);
        default:
            return res.r404();
        }
    },
    DELETE: function (req, res) {
        return delPoi(req, res);
    },
    filterPois: filterPois,
    setPoi: setPoi,
    convertPois: convertPois
};