
/*
pg = new PeerGroup( groupId, bio )  // host/join group

pg.joinedGroup( Bios )              // callback notifying the Bios of all other peers, upon joining group
pg.peerJoined( peerId, peerBio )    // callback notifying the id/bio, upon newly joined peer
pg.peerLeft( peerId )               // callback notifying the id, upon peer leaving group

pg.recv( message )                  // callback notifying the message, upon receipt
pg.send( message )                  // broadcast message to group

pg.isHost()                         // return if is host or simple peer

// data types //
  groupId = ''
   peerId = 0
  peerBio = ''
     Bios = { peerId:peerBio, ... }
  message = { userId:0, time:0, type:'', data:'', hash:0 }
*/

/* TODO:
  hashes for checksums
  functionality to reorganize peer/host in case of host error
  boot peer out of group
*/

function PeerGroup( groupId, bio ) {
  const max_connection_attempts = 5
  
  const pg = this

  pg._groupId = groupId
  pg._id = 0
  pg._attempts = max_connection_attempts

  pg.error = console.log
  pg.isHost = function() { return pg._id == 0 }

  pg.joinedGroup = function( Bios ) {
    if (Bios) { console.log('Joined Group "' + groupId + '" as Peer ' + pg._id + '.'); console.log('- Group Bios:', Bios) }
    else        console.log('Hosting Group "' + groupId + '".')
  }
  pg.leftGroup  = function() { console.log('Left Group "' + groupId + '".') }
  pg.peerJoined = function( peerId, peerBio ) { console.log('Peer ' + peerId + ' Joined Group.'); console.log('- Bio:', peerBio) }
  pg.peerLeft   = function( peerId          ) { console.log('Peer ' + peerId + ' Left Group.') }
  pg.recv = function( message ) { console.log(message.id, (new Date()).toLocaleString(), message.data) }
  pg.send = function( message ) {}

  pg._peer = new Peer(groupId)//, { debug: 3 })
  pg._peer.on('open', loadAsHost)
  pg._peer.on('error', function( e ) {
console.log('ERR_TYPE', e.type, e)
    switch (e.type) {
    case 'network':
      break
    case 'unavailable-id':
      loadAsPeer()
      break
    default:
      pg.error(e)
    }
  })

  // generate standard message from (data, type, id)
  function asMessage( data, type, id ) {
    if (id === undefined) id = pg._id
    const message = { id: id, time: Date.now(), data: data }
    if (type) message.type = type
    return message
  }

  function loadAsHost() {
    pg.joinedGroup()

    var peerId = 0
    const Connections = pg._Connections = {}
    pg._Bios = { 0: bio }
    function broadcast( message ) {
      if (message.type == "exit") { if (message.id != pg._id) pg.peerLeft(message.id) }
      else pg.recv(message)

      for (var id in Connections) {
        const conn = Connections[id]
        if (conn && conn.open) conn.send(message)
      }
    }

    pg._peer.on('connection', function( conn ) {
      conn.on('open', function() {
        peerId += 1

        conn.on('data', function( message ) {
          if (message.type == "intro") {
            Connections[peerId] = conn
            const bio = message.data
            pg._Bios[peerId] = bio
            pg.peerJoined(message.id, bio)

            conn.on('error', pg.error)
            conn.on('data', broadcast)
            conn.on('close', function() { broadcast(asMessage(null, "exit", peerId)) })
          }
        })

        const Bios = {}; Bios[peerId] = bio
        for (var id in pg._Bios) Bios[id] = pg._Bios[id]
        conn.send(asMessage(Bios, "invite", peerId))
      })
    })

    pg.send = function( data ) { broadcast(asMessage(data)) }
  }

  function loadAsPeer() {
    const reconnectTimeout = 1000
    var reconnect, isConnected = false

    function connect() {
      if ((pg._attempts -= 1) > 0) {
        console.log('Connecting as Peer (Attempts Remaining: ' + pg._attempts + ').')
        reconnect = setTimeout(connect, reconnectTimeout)
      }

      const peer = new Peer()
      const conn = peer.connect(groupId)

      conn.on('data', function( message ) {
        if (message.type == "invite") {
          if (isConnected) conn.close()
          else {
            isConnected = true
            clearTimeout(reconnect)

            conn.on('error', pg.error)
            conn.on('data' , pg.recv)
            conn.on('close', pg.leftGroup)
            
            pg._id = message.id
            pg._peer = peer
            pg.send = function( data ) {
              if (conn.open) conn.send(asMessage(data))
              else pg.leftGroup()
            }
            
            const Bios = message.data
            pg.joinedGroup(Bios)
            
            conn.send(asMessage(bio, "intro"))
          }
        }
      })
    }
    connect()
  }
}
