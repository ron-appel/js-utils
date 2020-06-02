"use strict"

function rand_int( m, max ) {
// return random int r: min <= r < min
//   r = rand_int(max) // min = 0
//   r = rand_int(min, max)

  if (max == undefined) { max = m; m = 0 }
  return m + Math.floor(Math.random() * (max - m))
}

function round( x, d ) {
// round x to d decimal places

  const precision = d? 10**d : 1;
  return Math.round(x *precision) /precision
}


function relu( x ) { return (x > 0)? x : 0 }

const sign = function( x, eps ) {
  if (eps == undefined) eps = 0
  return (x > eps)? 1 : ((x < -eps)? -1 : 0)
}

const hardshrink = function( x, eps ) {
  if (eps == undefined) eps = 1e-12
  return (x > eps || x < -eps)? x : 0
}
