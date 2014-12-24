"use strict";

var express = require("express");
var plugin = require("plugin")();
var events = require("events");

var route = express.Router();

var sequence = 0;

function newId() {
    return "id"+(sequence++);
}

function Pith (opts) {
    for(var x in opts) {
        this[x] = opts[x];
    }
    this.load();
}

Pith.prototype = {
    route: route,
    
    channels: [],
    channelMap: {},
    channelInstances: {},
    
    players: [],
    playerMap: {},
    
    getChannelInstance: function (channelId) {
        var channelInstance = this.channelInstances[channelId];
        if (channelInstance === undefined) {
            var channel = this.channelMap[channelId];
            channelInstance = this.channelInstances[channelId] = channel.init({pith: this});
        }
        return channelInstance;
    },
    
    registerChannel: function (channel) {
        this.channels.push(channel);
        this.channelMap[channel.id] = channel;
        this.channels.sort(function (a, b) {
            if (a.sequence === b.sequence) { return 0; }
            else if(a.sequence < b.sequence) return -1;
            else return 1;
        });
        this.emit("channelRegistered", channel);
    },
    
    registerPlayer: function (player) {
        if(!player.id) player.id = newId();
        this.players.push(player);
        this.playerMap[player.id] = player;
        this.emit("playerregistered", player);
        var self = this;
        player.on("statechange", function(status) {
            status.serverTimestamp = new Date().getTime();
            self.emit("playerstatechange", player.id, status);
        });
    },
    
    unregisterPlayer: function(player) {
        this.players = this.players.filter(function(e) {
            return e.id !== player.id;
        });
        this.playerMap[player.id] = undefined;
        this.emit("playerdisappeared", player);
    },
    
    updatePlayerStates: function() {
        var newTs = new Date().getTime();
        this.players.forEach(function(e) {
            try {
                if(e.status.state.playing) {
                    var delta = (newTs - e.status.serverTimestamp) / 1000;
                    e.status.position.time += delta;
                    e.status.serverTimestamp = newTs;
                }
            } catch(e) {
                
            }
        });
    },
    
    listPlayers: function(cb) {
        this.updatePlayerStates();
        cb(this.players);  
    },
    
    listChannels: function(cb) {
        cb(this.channels);
    },
    
    getChannelContentDetail: function (channelId, containerId, cb) {
        this.getChannelInstance(channelId).getItem(containerId, cb);
    },
    
    listChannelContents: function (channelId, containerId, cb) {
        this.getChannelInstance(channelId).listContents(containerId, cb);
    },
    
    getStream: function (channelId, itemId, cb) {
        var channelInstance = this.getChannelInstance(channelId);
        channelInstance.getStreamUrl(itemId, cb);
    },
    
    loadMedia: function(channelId, itemId, playerId, cb) {
        var self = this;
        var player = this.playerMap[playerId];
        var channel = self.getChannelInstance(channelId);
        channel.getItem(itemId, function(err, item) {
            channel.getStreamUrl(item, function(url) {
                player.load(item, url, function(err) {
                    if(err) {
                        cb(err);
                    } else {
                        player.play(function(err) {
                            if(err) {
                                cb(err);
                            } else {
                                cb();
                            }
                        });
                    }
                });
            });
        });
    },
    
    controlPlayback: function(playerId, command, query, cb) {
        var player = this.playerMap[playerId];
        if(typeof query === 'function') {
            cb = query;
            query = undefined;
        }
        player[command](cb, query);
    },
    
    load: function() {
        require("./plugins/files/plugin").plugin().init({pith: this});
        require("./plugins/movies/plugin").plugin().init({pith: this});
        require("./plugins/upnp-mediarenderer/plugin").plugin().init({pith: this});
    },
    
    handle: route
};

Pith.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = Pith;