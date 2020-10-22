
/*

pg = new PeerGroup( groupId, bio )  // host/join group

pg.connect( retryOnFail )           // connect to group (if not already connected)
pg.disconnect( peerId )             // disconnect from group (or disconnect peer if host)

pg.send( message, peerId )          // broadcast message to group/peer

pg.onJoinedGroup( Bios )            // callback notifying the Bios of all other peers, upon joining group
pg.onLeftGroup()                    // callback, upon leaving group
pg.onPeerJoined( peerId, peerBio )  // callback notifying the id/bio, upon newly joined peer
pg.onPeerLeft( peerId )             // callback notifying the id, upon peer leaving group
pg.onReceive( message )             // callback notifying the message, upon receipt

  -- data types --
groupId = ''
 peerId = 0
peerBio = ''
   Bios = { peerId:peerBio, ... }   // -id signifies peer that has already left group
message = { id:0, time:0, type:'', data:'', hash:0 }

  -- connection protocols --
host-connect      [new Peer(groupId) -> host.peer]

host-disconnect   [on host.peer.close]
  peer-notified   [on peer.conn.close]  // all peers

peer-connect      [peer.peer.connect(groupId, {metadata:bio}) -> peer.conn]
  host-notified   [on host.peer.connection -> host.conn]
  host-accepted   [host.conn.send({id:x, type:"intro",  data:Bios})]
  host-broadcast  [host.conn.send({id:x, type:"joined", data:bio})]  // to all peers

peer-disconnect   [peer.conn.close()]
  host-notified   [on host.conn.close]
  host-broadcast  [host.conn.send({id:x, type:"left"})]  // to all peers

host-dismiss      [host.conn.send({id:x, type:"leave"})]
  peer-notified   [peer.disconnect()]
  host-broadcast  [host.conn.send({id:x, type:"left"})]  // to all peers

  -- messaging protocols --
host-broadcast    [host.conn.send({id:0, data:message})]  // to all peers
host-private      [host.conn.send({id:0, data:message})]  // to y
peer-broadcast    [peer.conn.send({id:x, data:message})]
  host-broadcast  [host.conn.send({id:x, data:message})]  // to all peers
peer-private      [peer.conn.send({id:x, data:message}, to:y)]
  host-private    [host.conn.send({id:x, data:message})]  // to y

*/

/* TODO:
  hashes for checksums
*/

function PeerGroup( groupId, bio ) {
  // get peer given host
  function getPeer( groupId ) {
    return new Peer(groupId)//, { host: 'peer-group-server.herokuapp.com', secure: true })
  }
  
  // hard-code hostId = 0
  const hostId = 0

  const pg = this
  pg.error = function( e ) { console.log("Error type: " + e.type); console.log(e) }

  pg.isHost = function() { return pg.id == hostId }
  function isLive( id ) { return ((id != undefined)? id : pg.id) >= 0 }

  var peer
pg._peer = peer // for debugging
  // method to reset peer
  function destroy() {
    if (peer) peer.destroy()
    peer = null
  }

  var retryOnFail
  pg.connect = function( _retryOnFail ) {
    retryOnFail = _retryOnFail

    if (!peer || peer.destroyed) {
      peer = getPeer(groupId)

      peer.on('error', function( e ) {
        if (e.type == 'unavailable-id') connectAsPeer()
        else pg.error(e)
      })
      peer.on('open', initAsHost)
    }
  }

  // default disconnect method
  function disconnect() {
    // disable reconnection attempts
    retryOnFail = false
    destroy()
  }
  pg.disconnect = disconnect

  // default send method
  function send_fail( data, to ) { pg.error("Failed to send: no connection.") }
  pg.send = send_fail

  function onDestroyed() {
    // revert send method
    pg.send = send_fail

    if (isLive()) {
      // negate id to signify non-live
      pg.id = -1 - pg.id
      pg.onLeftGroup()
    }

    // reconnect (in new thread)
    setTimeout(function() { if (retryOnFail) pg.connect(true) }, 1)
  }

  pg.groupId = groupId
  // joinedGroup sets id
  function joinedGroup( peerId, Bios ) {
    pg.id = peerId
    pg.onJoinedGroup(Bios)
  }

  pg.onJoinedGroup = function( Bios ) {
    if (pg.isHost()) console.log('Hosting Group "' + pg.groupId + '".')
    else           { console.log( 'Joined Group "' + pg.groupId + '" as Peer ' + pg.id + '.')
                     console.log('- Group Bios:', Bios) }
  }
  pg.onLeftGroup  = function()                  { console.log('Left Group "' + pg.groupId + '".') }
  pg.onPeerJoined = function( peerId, peerBio ) { console.log('Peer ' + peerId + ' Joined Group.'); console.log('- Bio:', peerBio) }
  pg.onPeerLeft   = function( peerId          ) { console.log('Peer ' + peerId + ' Left Group.') }
  pg.onReceive    = function( message         ) { console.log(message.id, (new Date()).toLocaleString(), message.data) }

  function onMessage( message ) {
    switch (message.type) {
    case undefined:
      pg.onReceive(message)
      break
    case "joined":
      const bio = message.data
      pg.onPeerJoined(message.id, bio)
      break
    case "left":
      pg.onPeerLeft(message.id)
      break
    case "leave":
      disconnect()
      break
    }
  }

  // generate standard message (data, id, type, to)
  function asMessage( data, id, type, to ) {
    const message = { time: Date.now(), id: id, data: data }
    if (type) message.type = type
    if (to != undefined) message.to = to
    return message
  }

  function initAsHost() {
    // don't init again if already live
    if (isLive()) return

    // set disconnection callbacks
    peer.on('disconnected', function() { if (retryOnFail) peer.reconnect() })
    peer.on('close', onDestroyed)

    function relay( message ) {
      if (message.to != undefined) {
        if (message.to) send(message, message.to)
        else pg.onReceive(message)
      }
      else broadcast(message)
    }

    const Peers = {}; Peers[hostId] = { conn: null, bio: bio }
    function broadcast( message ) {
      if (message.id != hostId) onMessage(message)
      for (let id in Peers) { if (id > 0 && id != message.id) send(message, id) }
    }
    function send( message, id ) {
      const peer = Peers[id]
      if (peer && peer.conn) peer.conn.send(message)
    }

    // host disconnect function can also eject peers
    pg.disconnect = function( peerId ) {
      if (peerId) send(asMessage(null, 0, "leave"), peerId)
      else disconnect()
    }

    pg.send = function( data, to ) {
      const message = asMessage(data, 0, null)
      if (to != undefined) send(message, to)
      else broadcast(message)
    }

    // init peer-index as host-id so all peers will have larger ids than host
    var peerIndex = hostId
    // upon incoming connection request
    peer.on('connection', function( conn ) {
      // upon open connection
      conn.on('open', function() {
        // increment peer counter; prepare callbacks
        const peerId = (peerIndex += 1),
              bio = conn.metadata
        // append peer to Peers list
        Peers[peerId] = { conn: conn, bio: bio }

        conn.on('close', function() {
          // update peer that left
          Peers[-peerId] = Peers[peerId]
          delete Peers[peerId]

          // notify group upon peer leaving
          broadcast(asMessage(null, peerId, "left"))
        })

        // send intro message to new peer notifying its id and other bios
        const Bios = {}; for (var id in Peers) { if (id >= 0 && id != peerId) Bios[id] = Peers[id].bio }
        conn.send(asMessage(Bios, peerId, "intro"))
        // notify group
        broadcast(asMessage(bio, peerId, "joined"))
      })
      conn.on('error', pg.error)
      conn.on('data', relay)
    })

    // notify joined group
    joinedGroup(hostId)
  }

  function connectAsPeer() {
    // don't connect again if already live
    if (isLive()) return

    // connect as peer:
    //   connect to peer server
    //   open data connection
    //   disconnect from peer server

    peer = getPeer()

    // upon connection to brokering server
    peer.on('open', function() {
      const conn = peer.connect(groupId, { metadata: bio })

      conn.on('error', pg.error)
      conn.on('close', destroy)
      conn.on('data', function( message ) {
        // if id already set, this is not an intro message
        if (isLive()) onMessage(message)
        else {
          // initial message must be type=intro; joinedGroup() sets id
          if (message.type == "intro") {
            const Bios = message.data
            joinedGroup(message.id, Bios)
            // disconnect from peer server
            peer.disconnect()

            // enable send
            pg.send = function( data, to ) {
              if (pg.id != to) {
                const message = asMessage(data, pg.id, null, to)
                conn.send(message)
              }
            }
          }
          // else, invalid connection
          else {
            pg.error("Invalid connection.")
            destroy()
          }
        }
      })
    })
    peer.on('error', pg.error)
    peer.on('close', onDestroyed)
  }
}
