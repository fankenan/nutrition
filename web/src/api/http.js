import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('token')
      if (location.hash.includes('/login') === false && location.pathname !== '/login') {
        location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default http
