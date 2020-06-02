
function test_shuffle( N = 10, T = 1e6 ) {
  const A = new Array(N)
  for (let i = 0; i < N; i++) A[i] = i
  console.log(A)

  const Counts = new Array(N)
  for (let i = 0; i < N; i++) Counts[i] = 0
  
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) A[i] = i
    shuffle(A)

    for (let i = 0; i < N; i++) { if (A[i] == 0) Counts[i] += 1 }
  }
  for (let i = 0; i < N; i++) Counts[i] /= T
  console.log(Counts)
}
