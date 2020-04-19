"use strict"

// return random integer between 0 and N-1, with potential bias (<1: prefers lower indices, =1: uniform, >1: prefers higher indices)
const random_index = ( N, bias = 1.0 ) => Math.min(N-1, Math.floor(Math.pow(Math.random(), 1/bias) * N))

// function anneal( ... )
// args:
//   get_proposal: proposed_cost = f(iter, epoch)
//   set_proposal: f(is_accepted)
//   num_iters, num_epochs
// params:
//   .schedule: temperature = f(iter/num_iters)

function anneal( get_proposal, set_proposal, num_iters = 100, num_epochs = 1 ) {
  // ensure first proposal always accepted
  var cost = Infinity

  // epochs (outer loop)
  for (let epoch = 0; epoch < num_epochs; epoch++) {

    // iterations (inner loop)
    for (let iter = 1; iter <= num_iters; iter++) {

      // get new proposal and corresponding cost
      const proposed_cost = get_proposal(iter, epoch)

      // compute probability of accepting proposal:
      //   if cost decreases, prob > 1 and will always accept.
      //   if cost increases, the greater the increase, the lower the accept probability.
      //   the later the iteration, the larger the multiplier, causing to a lower "annealing temperature".
      //     hence, the lower the probability of moving to a higher cost later on in the annealing process.
      const accept_probability = Math.exp((cost - proposed_cost) * this.schedule(iter / num_iters))

      // if chance decides, accept proposal
      const random_probability = Math.random()
      const is_accepted = random_probability < accept_probability

      // update cost; set proposal as accepted/rejected
      if (is_accepted) cost = proposed_cost
      set_proposal(is_accepted)
    }
  }
}
// set default cooling schedule
anneal.schedule = x => Math.log1p(x *100)
