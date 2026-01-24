import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "monitor",
    component: () => import("./views/monitor.vue"),
  },
  {
    path: "/cinema",
    name: "cinema",
    component: () => import("./views/cinema.vue"),
  },
];

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
